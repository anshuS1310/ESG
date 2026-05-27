import os
import django

# Set up the Django configuration environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'esg_backend.settings')
django.setup()

from esg_backend.parsers import ingest_sap_csv, ingest_utility_csv, ingest_travel_csv
from esg_backend.models import CarbonEmissionRecord

if __name__ == "__main__":
    print("[Ingestion] Initializing pipeline execution...")
    
    print("[Ingestion] Processing SAP Procurement records...")
    ingest_sap_csv()
    
    print("[Ingestion] Processing Facility Utility bills...")
    ingest_utility_csv()
    
    print("[Ingestion] Processing Corporate Travel matrices...")
    ingest_travel_csv()
    
    total_records = CarbonEmissionRecord.objects.count()
    suspicious_count = CarbonEmissionRecord.objects.filter(status='FLAGGED').count()
    
    print("\n[Ingestion] Execution Complete!")
    print(f"Total Database Records Loaded: {total_records}")
    print(f"Flagged Rows for Analyst Review: {suspicious_count}")