import decimal
from esg_backend.models import CarbonEmissionRecord

# Standardized Carbon Emission Factors (in kg CO2e per unit)
COEFFS = {
    'DIESEL': 2.68,        # kg CO2e per Liter
    'PETROL': 2.31,        # kg CO2e per Liter
    'JET_FUEL': 2.54,      # kg CO2e per Liter (or M3 standard)
    'CNG': 2.00,           # kg CO2e per M3
    'BIODIESEL': 0.15,     # kg CO2e per Liter
    'LUBE_OIL': 1.80,      # kg CO2e per Liter
    'GRID_ELECTRICITY': 0.82, # kg CO2e per kWh
    'TRAVEL_FLIGHT': 0.24,  # kg CO2e per mile
    'TRAVEL_RAIL': 0.06,    # kg CO2e per mile
    'TRAVEL_HOTEL': 14.20,  # kg CO2e per night (standard night factor)
}

# Regional grid tariff rate for India (in INR per kWh)
ELECTRICITY_TARIFF_RATE = 9.0

# Airport distance lookup matrix (in miles)
AIRPORT_DISTANCES = {
    'DEL-LHR': 4170.0,
    'BOM-SIN': 2420.0,
    'BLR-DXB': 1700.0,
    'LHR-JFK': 3451.0,
    'SIN-HKG': 1590.0,
    'DEL-BOM': 710.0,
    'DEL-CCU': 810.0,
    'BLR-MAA': 180.0,
    'DXB-LHR': 3400.0,
    'DEL-SYD': 6450.0,
    'JFK-LAX': 2475.0,
    'LAX-SFO': 337.0,
    'BOM-DEL': 710.0,
}

def get_airport_distance(origin, destination):
    """
    Looks up distance between airport codes bidirectionally.
    """
    if not origin or not destination:
        return 0.0
    
    org_code = str(origin).strip().upper()
    dest_code = str(destination).strip().upper()
    
    # Bidirectional key sorting (e.g. LHR-DEL -> DEL-LHR)
    sorted_pair = sorted([org_code, dest_code])
    key = f"{sorted_pair[0]}-{sorted_pair[1]}"
    
    return AIRPORT_DISTANCES.get(key, 0.0)


def calculate_emissions(source_type, activity_type, quantity, unit, custom_factor=None):
    """
    Calculates carbon emissions in KG CO2e based on the standard coefficients.
    """
    qty = float(quantity)
    
    # 1. SAP Calculations
    if source_type == 'SAP':
        # Normalize M3 to Liters
        normalized_qty = qty
        if str(unit).upper() == 'M3':
            normalized_qty = qty * 1000.0
            
        # Use database factor if available (since the raw SAP CSV contains customized CO2_FACTORs)
        if custom_factor is not None:
            factor = float(custom_factor)
            return (normalized_qty * factor) / 1000.0
            
        # Fallback to predefined services coefficients
        act_upper = str(activity_type).upper()
        if 'DIESEL' in act_upper:
            return normalized_qty * COEFFS['DIESEL']
        elif 'PETROL' in act_upper:
            return normalized_qty * COEFFS['PETROL']
        elif 'JET' in act_upper:
            return normalized_qty * COEFFS['JET_FUEL']
        elif 'CNG' in act_upper or 'NATURAL GAS' in act_upper:
            return normalized_qty * COEFFS['CNG']
        elif 'BIO' in act_upper:
            return normalized_qty * COEFFS['BIODIESEL']
        else:
            return normalized_qty * COEFFS['LUBE_OIL']

    # 2. Utility Calculations
    elif source_type == 'UTILITY':
        # Standard power grid factor
        return qty * COEFFS['GRID_ELECTRICITY']

    # 3. Corporate Travel Calculations
    elif source_type == 'TRAVEL':
        act_upper = str(activity_type).upper()
        if 'FLIGHT' in act_upper:
            return qty * COEFFS['TRAVEL_FLIGHT']
        elif 'RAIL' in act_upper:
            return qty * COEFFS['TRAVEL_RAIL']
        elif 'HOTEL' in act_upper:
            return qty * COEFFS['TRAVEL_HOTEL']
        
    return 0.0


def validate_record_payload(source_type, row_dict):
    """
    Validates a raw data row and returns (is_anomaly, anomaly_reason).
    """
    # 1. SAP Anomaly Checking
    if source_type == 'SAP':
        kostl = row_dict.get('KOSTL')
        if not kostl or str(kostl).strip() == "" or str(kostl).upper() == 'NAN':
            return True, "Missing critical SAP Cost Center (KOSTL column link empty)."

    # 2. Utility Anomaly Checking
    elif source_type == 'UTILITY':
        kwh = row_dict.get('kwh_amount')
        cost = row_dict.get('cost_inr')
        
        # Check if kWh is missing but cost is present
        is_kwh_missing = not kwh or str(kwh).strip() == "" or str(kwh).upper() == 'NAN' or float(kwh) == 0.0
        is_cost_present = cost and str(cost).strip() != "" and str(cost).upper() != 'NAN' and float(cost) > 0.0
        
        if is_kwh_missing:
            if is_cost_present:
                return True, f"Utility bill has missing kWh activity metrics, but lists an invoice cost of ₹{float(cost):,.2f}."
            else:
                return True, "Utility bill is completely missing both kwh_amount activity and invoice cost."

    # 3. Corporate Travel Anomaly Checking
    elif source_type == 'TRAVEL':
        segment = str(row_dict.get('segment_type', '')).lower()
        miles = row_dict.get('miles')
        
        if segment == 'flight':
            is_miles_missing = not miles or str(miles).strip() == "" or str(miles).upper() == 'NAN' or float(miles) == 0.0
            if is_miles_missing:
                origin = row_dict.get('origin', 'Unknown')
                dest = row_dict.get('destination', 'Unknown')
                return True, f"Missing mileage distance for flight segment {origin} ➔ {dest}."
                
    return False, None


def resolve_record_anomaly(record):
    """
    Applies auto-healers to resolve data quality issues and recalculates carbon.
    """
    if record.status != 'FLAGGED':
        return False
        
    source_type = record.source_mapping.source_type
    payload = record.raw_data_payload
    
    # 1. Resolve SAP Cost Center issues (Requires manual override, cannot auto-heal without input)
    if source_type == 'SAP':
        # If user has set a cost center, they resolve it. If it's still missing, it cannot be auto-resolved.
        kostl = payload.get('KOSTL')
        if kostl and str(kostl).strip() != "" and str(kostl).upper() != 'NAN':
            record.status = 'PENDING'
            record.anomaly_reason = None
            record.save()
            return True
        return False
        
    # 2. Resolve Utility missing kWh using cost estimation
    elif source_type == 'UTILITY':
        cost = float(record.cost_in_inr) if record.cost_in_inr else 0.0
        if cost > 0.0:
            estimated_kwh = cost / ELECTRICITY_TARIFF_RATE
            
            # Update fields
            record.raw_quantity = decimal.Decimal(str(estimated_kwh))
            record.normalized_quantity = decimal.Decimal(str(estimated_kwh))
            record.co2_emissions_kg = decimal.Decimal(str(estimated_kwh * COEFFS['GRID_ELECTRICITY']))
            record.status = 'PENDING'
            record.anomaly_reason = None
            
            # Sync payload
            payload['kwh_amount'] = estimated_kwh
            record.raw_data_payload = payload
            record.save()
            return True
        return False
        
    # 3. Resolve Flight missing mileage using airport distance lookup
    elif source_type == 'TRAVEL':
        segment = str(payload.get('segment_type', '')).lower()
        if segment == 'flight':
            origin = payload.get('origin')
            dest = payload.get('destination')
            miles = get_airport_distance(origin, dest)
            
            if miles > 0.0:
                record.raw_quantity = decimal.Decimal(str(miles))
                record.normalized_quantity = decimal.Decimal(str(miles))
                record.co2_emissions_kg = decimal.Decimal(str(miles * COEFFS['TRAVEL_FLIGHT']))
                record.status = 'PENDING'
                record.anomaly_reason = None
                
                # Sync payload
                payload['miles'] = miles
                record.raw_data_payload = payload
                record.save()
                return True
        return False
        
    return False
