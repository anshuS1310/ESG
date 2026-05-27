import json
import decimal
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import datetime
from esg_backend.models import CarbonEmissionRecord, AuditTrail, Organization, DataSource
from esg_backend.parsers import ingest_sap_csv, ingest_utility_csv, ingest_travel_csv
from esg_backend.services import calculate_emissions, resolve_record_anomaly

def get_record_serializer(r):
    """
    Standard serializer helper for Emission Records.
    """
    return {
        'id': str(r.id),
        'raw_record_id': r.raw_record_id,
        'scope_category': r.scope_category,
        'activity_type': r.activity_type,
        'start_date': str(r.start_date),
        'end_date': str(r.end_date),
        'raw_quantity': float(r.raw_quantity),
        'raw_unit': r.raw_unit,
        'normalized_quantity': float(r.normalized_quantity),
        'cost_in_inr': float(r.cost_in_inr) if r.cost_in_inr else 0.0,
        'co2_emissions_kg': float(r.co2_emissions_kg) if r.co2_emissions_kg else 0.0,
        'status': r.status,
        'anomaly_reason': r.anomaly_reason,
        'source_type': r.source_mapping.source_type if r.source_mapping else "MANUAL",
        'raw_data_payload': r.raw_data_payload,
        'audits': [
            {
                'timestamp': str(a.action_timestamp),
                'action': a.action_taken,
                'changes': a.changes_json
            } for a in r.audits.all().order_by('-action_timestamp')
        ]
    }


def list_emissions_api(request):
    """
    GET endpoint to retrieve carbon emission records.
    Supports query parameters for filtering and full-text search:
    Filters: ?scope=SCOPE_2&status=FLAGGED&source=SAP
    Search: ?q=Delhi
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed. Use GET.'}, status=405)

    # Extract optional filters from request parameters
    scope_filter = request.GET.get('scope')
    status_filter = request.GET.get('status')
    source_filter = request.GET.get('source')
    search_query = request.GET.get('q')

    # Initialize base query set
    records = CarbonEmissionRecord.objects.all().order_by('-start_date')

    if scope_filter and scope_filter != 'ALL':
        records = records.filter(scope_category=scope_filter)
    if status_filter and status_filter != 'ALL':
        records = records.filter(status=status_filter)
    if source_filter and source_filter != 'ALL':
        records = records.filter(source_mapping__source_type=source_filter)
        
    if search_query:
        q = search_query.strip()
        records = records.filter(
            Q(activity_type__icontains=q) |
            Q(raw_record_id__icontains=q) |
            Q(anomaly_reason__icontains=q) |
            Q(raw_unit__icontains=q)
        )

    # Serialize record objects to dictionaries
    data_list = [get_record_serializer(r) for r in records]

    return JsonResponse({'records': data_list}, safe=False)


@csrf_exempt
def review_record_api(request, record_id):
    """
    POST/PATCH endpoint for analysts to sign off or flag an ingestion row.
    Accepts string-based raw_record_ids or primary keys from external sources.
    """
    if request.method not in ['POST', 'PATCH']:
        return JsonResponse({'error': 'Method not allowed. Use POST or PATCH.'}, status=405)

    try:
        record = CarbonEmissionRecord.objects.get(Q(raw_record_id=record_id) | Q(id=record_id))
    except CarbonEmissionRecord.DoesNotExist:
        return JsonResponse({'error': f'Record with ID {record_id} not found.'}, status=404)

    # Immutable lock check
    if record.status == 'APPROVED':
        return JsonResponse({'error': 'APPROVED records are locked and immutable.'}, status=403)

    try:
        body = json.loads(request.body)
        new_status = body.get('status')
        comment = body.get('comment', 'Analyst sign-off update.')
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body payload provided.'}, status=400)

    valid_statuses = ['PENDING', 'APPROVED', 'FLAGGED']
    if not new_status or new_status.upper() not in valid_statuses:
        return JsonResponse({'error': f'Invalid status. Must be one of: {valid_statuses}'}, status=400)

    old_status = record.status
    record.status = new_status.upper()
    
    if record.status == 'APPROVED':
        record.anomaly_reason = None
        record.reviewed_at = timezone.now()
        
    record.save()

    AuditTrail.objects.create(
        record=record,
        action_taken='REVIEWED',
        changes_json={
            'old_status': old_status,
            'new_status': record.status,
            'comment': comment
        }
    )

    return JsonResponse({
        'success': True,
        'message': f'Record {record_id} successfully updated to {record.status}.',
        'record': get_record_serializer(record)
    })


@csrf_exempt
def bulk_approve_api(request):
    """
    POST endpoint to bulk approve an array of record IDs.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed. Use POST.'}, status=405)
        
    try:
        body = json.loads(request.body)
        record_ids = body.get('record_ids', [])
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body payload provided.'}, status=400)
        
    if not record_ids:
        return JsonResponse({'error': 'No record IDs provided for bulk approval.'}, status=400)
        
    records = CarbonEmissionRecord.objects.filter(id__in=record_ids).exclude(status='APPROVED')
    count = 0
    for record in records:
        record.status = 'APPROVED'
        record.anomaly_reason = None
        record.reviewed_at = timezone.now()
        record.save()
        
        AuditTrail.objects.create(
            record=record,
            action_taken='APPROVE',
            changes_json={'message': 'Record bulk-approved by auditor.'}
        )
        count += 1
        
    return JsonResponse({
        'success': True,
        'message': f'Successfully approved {count} emission records in bulk.'
    })


@csrf_exempt
def auto_resolve_api(request, record_id):
    """
    POST endpoint to trigger auto-healing logic on a flagged anomaly.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed. Use POST.'}, status=405)
        
    try:
        record = CarbonEmissionRecord.objects.get(Q(raw_record_id=record_id) | Q(id=record_id))
    except CarbonEmissionRecord.DoesNotExist:
        return JsonResponse({'error': f'Record with ID {record_id} not found.'}, status=404)
        
    if record.status != 'FLAGGED':
        return JsonResponse({'error': 'Only FLAGGED records can be auto-resolved.'}, status=400)
        
    success = resolve_record_anomaly(record)
    if success:
        AuditTrail.objects.create(
            record=record,
            action_taken='AUTO_HEAL',
            changes_json={'message': 'Data quality issue auto-resolved using estimation engines.'}
        )
        return JsonResponse({
            'success': True,
            'message': 'Record data quality anomaly successfully auto-resolved.',
            'record': get_record_serializer(record)
        })
    else:
        return JsonResponse({'error': 'Auto-heal algorithm could not resolve this anomaly structure.'}, status=422)


@csrf_exempt
def edit_record_api(request, record_id):
    """
    POST/PATCH endpoint to manually correct records and automatically recalculate carbon values.
    """
    if request.method not in ['POST', 'PATCH']:
        return JsonResponse({'error': 'Method not allowed. Use POST or PATCH.'}, status=405)
        
    try:
        record = CarbonEmissionRecord.objects.get(Q(raw_record_id=record_id) | Q(id=record_id))
    except CarbonEmissionRecord.DoesNotExist:
        return JsonResponse({'error': f'Record with ID {record_id} not found.'}, status=404)
        
    if record.status == 'APPROVED':
        return JsonResponse({'error': 'APPROVED records are immutable.'}, status=403)
        
    try:
        body = json.loads(request.body)
        raw_qty = body.get('raw_quantity')
        cost = body.get('cost_in_inr')
        start_date_str = body.get('start_date')
        end_date_str = body.get('end_date')
        raw_unit = body.get('raw_unit')
        activity_type = body.get('activity_type')
        anomaly_reason = body.get('anomaly_reason')
        status = body.get('status')
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body payload provided.'}, status=400)
        
    changes = {}
    
    if raw_qty is not None:
        changes['raw_quantity'] = (float(record.raw_quantity), float(raw_qty))
        record.raw_quantity = decimal.Decimal(str(raw_qty))
        
        # Recalculate normalized quantity
        record.normalized_quantity = record.raw_quantity
        if record.raw_unit.upper() == 'M3':
            record.normalized_quantity = record.raw_quantity * 1000
            
    if cost is not None:
        changes['cost_in_inr'] = (float(record.cost_in_inr) if record.cost_in_inr else None, float(cost))
        record.cost_in_inr = decimal.Decimal(str(cost))
        
    if start_date_str is not None:
        changes['start_date'] = (str(record.start_date), start_date_str)
        record.start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        
    if end_date_str is not None:
        changes['end_date'] = (str(record.end_date), end_date_str)
        record.end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        
    if raw_unit is not None:
        changes['raw_unit'] = (record.raw_unit, raw_unit)
        record.raw_unit = raw_unit
        
    if activity_type is not None:
        changes['activity_type'] = (record.activity_type, activity_type)
        record.activity_type = activity_type

    if anomaly_reason is not None:
        changes['anomaly_reason'] = (record.anomaly_reason, anomaly_reason)
        record.anomaly_reason = anomaly_reason

    # Automatically recalculate emissions when quantity changes
    source_type = record.source_mapping.source_type
    custom_factor = record.raw_data_payload.get('CO2_FACTOR') if record.raw_data_payload else None
    
    new_emissions = calculate_emissions(
        source_type,
        record.activity_type,
        float(record.raw_quantity),
        record.raw_unit,
        custom_factor
    )
    
    changes['co2_emissions_kg'] = (float(record.co2_emissions_kg) if record.co2_emissions_kg else 0.0, float(new_emissions))
    record.co2_emissions_kg = decimal.Decimal(str(new_emissions))
    
    # Update status if user overrides and fixes the flag manually
    if status is not None:
        changes['status'] = (record.status, status)
        record.status = status
    elif record.status == 'FLAGGED' and (raw_qty is not None or cost is not None):
        # Auto return to pending on manual repair
        changes['status'] = (record.status, 'PENDING')
        record.status = 'PENDING'
        record.anomaly_reason = None
        
    record.save()
    
    AuditTrail.objects.create(
        record=record,
        action_taken='EDIT',
        changes_json=changes
    )
    
    return JsonResponse({
        'success': True,
        'message': 'Record manual correction registered and carbon recalculated.',
        'record': get_record_serializer(record)
    })


@csrf_exempt
def ingest_pipeline_trigger(request):
    """
    POST endpoint to trigger loading raw data sheets in the ingestion pipeline.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed. Use POST.'}, status=405)
        
    # Check if a custom file is uploaded or if default preloads are requested
    source_type = request.POST.get('source_type')
    
    try:
        sap_created, sap_flags = ingest_sap_csv()
        util_created, util_flags = ingest_utility_csv()
        travel_created, travel_flags = ingest_travel_csv()
        
        return JsonResponse({
            'success': True,
            'message': 'Ingestion pipeline execution complete.',
            'summary': {
                'sap': {'records': sap_created, 'anomalies': sap_flags},
                'utility': {'records': util_created, 'anomalies': util_flags},
                'travel': {'records': travel_created, 'anomalies': travel_flags},
            }
        })
    except Exception as e:
        return JsonResponse({'error': f'Pipeline failed: {str(e)}'}, status=500)


def dashboard_statistics_api(request):
    """
    GET endpoint to retrieve carbon footprint and data quality statistics for charts.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed. Use GET.'}, status=405)

    # 1. Total footprints by scope (in kg)
    total_kg = CarbonEmissionRecord.objects.aggregate(total=Sum('co2_emissions_kg'))['total'] or 0.0
    scope_totals = CarbonEmissionRecord.objects.values('scope_category').annotate(total=Sum('co2_emissions_kg'))
    
    scopes = {'SCOPE_1': 0.0, 'SCOPE_2': 0.0, 'SCOPE_3': 0.0}
    for item in scope_totals:
        scopes[item['scope_category']] = float(item['total'] or 0.0)
        
    # 2. Status distribution counts
    status_counts = CarbonEmissionRecord.objects.values('status').annotate(count=Count('id'))
    statuses = {'PENDING': 0, 'FLAGGED': 0, 'APPROVED': 0}
    for item in status_counts:
        statuses[item['status']] = item['count']
        
    # 3. Monthly aggregated timelines
    # Standard SQLite/SQL monthly aggregation
    monthly_data = CarbonEmissionRecord.objects.values('start_date__year', 'start_date__month').annotate(
        emissions=Sum('co2_emissions_kg'),
        scope_1=Sum('co2_emissions_kg', filter=Q(scope_category='SCOPE_1')),
        scope_2=Sum('co2_emissions_kg', filter=Q(scope_category='SCOPE_2')),
        scope_3=Sum('co2_emissions_kg', filter=Q(scope_category='SCOPE_3')),
        cost=Sum('cost_in_inr')
    ).order_by('start_date__year', 'start_date__month')
    
    timeline = []
    # Format monthly outputs: e.g. "2025-03"
    for item in monthly_data:
        yr = item.get('start_date__year')
        mo = item.get('start_date__month')
        if not yr or not mo:
            # Fallback if SQLite extract doesn't return keys directly
            continue
        date_str = f"{yr}-{str(mo).zfill(2)}"
        timeline.append({
            'period': date_str,
            'emissions_kg': float(item['emissions'] or 0.0),
            'scope_1_kg': float(item['scope_1'] or 0.0),
            'scope_2_kg': float(item['scope_2'] or 0.0),
            'scope_3_kg': float(item['scope_3'] or 0.0),
            'cost_inr': float(item['cost'] or 0.0)
        })
        
    # If timeline is empty due to SQLite date extraction variants, aggregate in python safely
    if not timeline:
        records = CarbonEmissionRecord.objects.all()
        aggregated = {}
        for r in records:
            p = r.start_date.strftime("%Y-%m")
            if p not in aggregated:
                aggregated[p] = {'emissions': 0.0, 'scope_1': 0.0, 'scope_2': 0.0, 'scope_3': 0.0, 'cost': 0.0}
            aggregated[p]['emissions'] += float(r.co2_emissions_kg or 0.0)
            if r.scope_category == 'SCOPE_1':
                aggregated[p]['scope_1'] += float(r.co2_emissions_kg or 0.0)
            elif r.scope_category == 'SCOPE_2':
                aggregated[p]['scope_2'] += float(r.co2_emissions_kg or 0.0)
            elif r.scope_category == 'SCOPE_3':
                aggregated[p]['scope_3'] += float(r.co2_emissions_kg or 0.0)
            aggregated[p]['cost'] += float(r.cost_in_inr or 0.0)
            
        timeline = [
            {
                'period': k, 
                'emissions_kg': v['emissions'], 
                'scope_1_kg': v['scope_1'], 
                'scope_2_kg': v['scope_2'], 
                'scope_3_kg': v['scope_3'], 
                'cost_inr': v['cost']
            }
            for k, v in sorted(aggregated.items())
        ]

    # 4. Data Quality Feed: latest 5 flagged anomalies
    flagged_feed = CarbonEmissionRecord.objects.filter(status='FLAGGED').order_by('-start_date')[:5]
    feed_list = [
        {
            'id': str(f.id),
            'raw_record_id': f.raw_record_id,
            'source_type': f.source_mapping.source_type,
            'activity_type': f.activity_type,
            'reason': f.anomaly_reason,
            'cost': float(f.cost_in_inr) if f.cost_in_inr else 0.0
        } for f in flagged_feed
    ]

    return JsonResponse({
        'total_emissions_kg': float(total_kg),
        'scope_distribution': scopes,
        'status_distribution': statuses,
        'timeline': timeline,
        'flagged_feed': feed_list
    })
