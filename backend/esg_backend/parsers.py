import os
import pandas as pd
from datetime import datetime
from django.conf import settings
from django.contrib.auth.models import User
from esg_backend.models import Organization, DataSource, CarbonEmissionRecord, AuditTrail
from esg_backend.services import calculate_emissions, validate_record_payload

def get_or_create_default_org():
    return Organization.objects.get_or_create(name="Breathe ESG Test Labs")[0]

def clean_payload(payload_dict):
    """
    Cleans a dictionary by replacing pandas NaN values with None
    so that SQLite can safely serialize it into a JSONField.
    """
    cleaned = {}
    for k, v in payload_dict.items():
        if pd.isna(v):
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

def clean_num(val, default=0.0):
    """
    Safely parses numeric entries from pandas rows,
    replacing NaN values with the default.
    """
    if pd.isna(val):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def ingest_sap_csv(file_path=None):
    """
    Ingests SAP procurement fuel data.
    """
    if not file_path:
        file_path = os.path.join(settings.BASE_DIR, 'data', 'SAP.csv')
        
    if not os.path.exists(file_path):
        print(f"SAP data file not found at {file_path}")
        return 0, 0

    org = get_or_create_default_org()
    source, _ = DataSource.objects.get_or_create(
        organization=org,
        source_type='SAP',
        file_name=os.path.basename(file_path)
    )

    df = pd.read_csv(file_path)
    records_created = 0
    anomalies_flagged = 0
    
    for _, row in df.iterrows():
        raw_id = str(row.get('EBELN', '')) + '-' + str(row.get('EBELP', ''))
        payload = clean_payload(row.to_dict())
        
        raw_date_str = str(row['BUDAT'])
        try:
            parsed_date = datetime.strptime(raw_date_str, "%Y%m%d").date()
        except Exception:
            try:
                parsed_date = datetime.strptime(raw_date_str, "%Y-%m-%d").date()
            except Exception:
                parsed_date = datetime.now().date()

        raw_unit = str(row['MEINS'])
        raw_qty = clean_num(row['MENGE'])
        cost = clean_num(row['NETPR'])
        custom_factor = row.get('CO2_FACTOR')
        
        # Validation checks
        is_anomaly, anomaly_reason = validate_record_payload('SAP', payload)
        status = 'FLAGGED' if is_anomaly else 'PENDING'
        if is_anomaly:
            anomalies_flagged += 1

        # Calculate emissions
        calculated_emissions = calculate_emissions('SAP', str(row['MAKTX']), raw_qty, raw_unit, custom_factor)

        # Handle M3 normalization for database metrics columns
        normalized_qty = raw_qty
        if raw_unit.upper() == 'M3':
            normalized_qty = raw_qty * 1000.0

        # Scope Classification: purchased fuel/lubricant/gas is Scope 1 (direct)
        # Corporate flight travel (under aviation) is Scope 3 (value chain)
        scope_cat = 'SCOPE_1'
        if str(row.get('MATKL', '')).upper() == 'AVIATION':
            scope_cat = 'SCOPE_3'

        record, created = CarbonEmissionRecord.objects.get_or_create(
            organization=org,
            source_mapping=source,
            raw_record_id=raw_id,
            defaults={
                'raw_data_payload': payload,
                'scope_category': scope_cat,
                'activity_type': str(row['MAKTX']),
                'start_date': parsed_date,
                'end_date': parsed_date,
                'raw_quantity': raw_qty,
                'raw_unit': raw_unit,
                'normalized_quantity': normalized_qty,
                'cost_in_inr': cost,
                'co2_emissions_kg': calculated_emissions,
                'status': status,
                'anomaly_reason': anomaly_reason
            }
        )
        if created:
            records_created += 1
            AuditTrail.objects.create(
                record=record,
                action_taken='IMPORT',
                changes_json={'message': 'Record ingested via SAP procurement parser.'}
            )

    return records_created, anomalies_flagged


def ingest_utility_csv(file_path=None):
    """
    Ingests utility power grid metrics.
    """
    if not file_path:
        file_path = os.path.join(settings.BASE_DIR, 'data', 'Utility.csv')
        
    if not os.path.exists(file_path):
        print(f"Utility data file not found at {file_path}")
        return 0, 0

    org = get_or_create_default_org()
    source, _ = DataSource.objects.get_or_create(
        organization=org,
        source_type='UTILITY',
        file_name=os.path.basename(file_path)
    )

    df = pd.read_csv(file_path)
    records_created = 0
    anomalies_flagged = 0
    
    for idx, row in df.iterrows():
        meter_id = str(row['meter_id'])
        start_dt = datetime.strptime(str(row['billing_start']), "%Y-%m-%d").date()
        end_dt = datetime.strptime(str(row['billing_end']), "%Y-%m-%d").date()
        
        raw_qty = clean_num(row['kwh_amount'])
        cost = clean_num(row['cost_inr'])
        payload = clean_payload(row.to_dict())

        # Validation checks
        is_anomaly, anomaly_reason = validate_record_payload('UTILITY', payload)
        status = 'FLAGGED' if is_anomaly else 'PENDING'
        if is_anomaly:
            anomalies_flagged += 1

        # Calculate emissions
        calculated_emissions = calculate_emissions('UTILITY', f"Electricity from {row['provider']}", raw_qty, 'kWh')

        raw_id = f"{meter_id}-{str(row['billing_start'])}"

        record, created = CarbonEmissionRecord.objects.get_or_create(
            organization=org,
            source_mapping=source,
            raw_record_id=raw_id,
            defaults={
                'raw_data_payload': payload,
                'scope_category': 'SCOPE_2',
                'activity_type': f"Electricity Grid - {row['provider']} ({meter_id})",
                'start_date': start_dt,
                'end_date': end_dt,
                'raw_quantity': raw_qty,
                'raw_unit': 'kWh',
                'normalized_quantity': raw_qty,
                'cost_in_inr': cost,
                'co2_emissions_kg': calculated_emissions,
                'status': status,
                'anomaly_reason': anomaly_reason
            }
        )
        if created:
            records_created += 1
            AuditTrail.objects.create(
                record=record,
                action_taken='IMPORT',
                changes_json={'message': 'Record ingested via Facility Utility bills parser.'}
            )

    return records_created, anomalies_flagged


def ingest_travel_csv(file_path=None):
    """
    Ingests corporate business travel records.
    """
    if not file_path:
        file_path = os.path.join(settings.BASE_DIR, 'data', 'travel.csv')
        
    if not os.path.exists(file_path):
        print(f"Travel data file not found at {file_path}")
        return 0, 0

    org = get_or_create_default_org()
    source, _ = DataSource.objects.get_or_create(
        organization=org,
        source_type='TRAVEL',
        file_name=os.path.basename(file_path)
    )

    df = pd.read_csv(file_path)
    records_created = 0
    anomalies_flagged = 0
    
    for idx, row in df.iterrows():
        trip_id = str(row['trip_id'])
        travel_date = datetime.strptime(str(row['travel_date']), "%Y-%m-%d").date()
        segment = str(row['segment_type'])
        payload = clean_payload(row.to_dict())

        # Validation checks
        is_anomaly, anomaly_reason = validate_record_payload('TRAVEL', payload)
        status = 'FLAGGED' if is_anomaly else 'PENDING'
        if is_anomaly:
            anomalies_flagged += 1

        raw_qty = clean_num(row.get('miles', 0)) if segment.lower() != 'hotel' else clean_num(row.get('nights', 1.0))
        if segment.lower() == 'hotel' and raw_qty == 0.0:
            raw_qty = 1.0 # default to 1 night if 0 listed in hotel segments

        # Calculate emissions
        calculated_emissions = calculate_emissions('TRAVEL', f"Business Travel ({segment})", raw_qty, 'Miles' if segment.lower() != 'hotel' else 'Nights')

        record, created = CarbonEmissionRecord.objects.get_or_create(
            organization=org,
            source_mapping=source,
            raw_record_id=trip_id,
            defaults={
                'raw_data_payload': payload,
                'scope_category': 'SCOPE_3',
                'activity_type': f"Business Travel ({segment}) - {row['traveler_name']}",
                'start_date': travel_date,
                'end_date': travel_date,
                'raw_quantity': raw_qty,
                'raw_unit': 'Nights' if segment.lower() == 'hotel' else 'Miles',
                'normalized_quantity': raw_qty,
                'cost_in_inr': clean_num(row['ticket_cost_inr']),
                'co2_emissions_kg': calculated_emissions,
                'status': status,
                'anomaly_reason': anomaly_reason
            }
        )
        if created:
            records_created += 1
            AuditTrail.objects.create(
                record=record,
                action_taken='IMPORT',
                changes_json={'message': 'Record ingested via Corporate Travel parser.'}
            )

    return records_created, anomalies_flagged