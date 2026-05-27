from django.db import models
from django.contrib.auth.models import User
import uuid

class Organization(models.Model):
    """
    Represents a client organization (tenant) for data isolation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class DataSource(models.Model):
    """
    Tracks the origin of ingested data files for audit lineage.
    """
    SOURCE_TYPES = [
        ('SAP', 'SAP ERP Procurement'),
        ('UTILITY', 'Utility Portal Template'),
        ('TRAVEL', 'Corporate Travel Tracker'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='data_sources')
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    file_name = models.CharField(max_length=255, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.organization.name} - {self.source_type} ({self.uploaded_at.date()})"


class CarbonEmissionRecord(models.Model):
    """
    Stores carbon emission records normalized across scopes and sources.
    """
    SCOPE_CHOICES = [
        ('SCOPE_1', 'Scope 1: Direct Emissions'),
        ('SCOPE_2', 'Scope 2: Indirect Emissions'),
        ('SCOPE_3', 'Scope 3: Value Chain Activity'),
    ]

    STATUS_CHOICES = [
        ('PENDING', 'Pending Review'),
        ('FLAGGED', 'Flagged Suspicious'),
        ('APPROVED', 'Approved & Immutable'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    source_mapping = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='records')
    
    # Ingestion audit and lineage tracking
    raw_record_id = models.CharField(max_length=100, help_text="Original unique row identifier")
    raw_data_payload = models.JSONField(help_text="Original raw un-normalized row for fallback reviews")

    # Scope and activity categories
    scope_category = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    activity_type = models.CharField(max_length=100, help_text="e.g., Diesel, Electricity, Flight, Hotel")
    
    # Activity dates
    start_date = models.DateField()
    end_date = models.DateField()

    # Original and normalized metrics
    raw_quantity = models.DecimalField(max_digits=15, decimal_places=4)
    raw_unit = models.CharField(max_length=20)
    normalized_quantity = models.DecimalField(max_digits=15, decimal_places=4, help_text="Standardized quantity baseline")
    
    # Cost and emissions calculations
    cost_in_inr = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    co2_emissions_kg = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    
    # Review workflow fields
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING')
    anomaly_reason = models.TextField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewer')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['organization', 'status']),
            models.Index(fields=['scope_category']),
        ]

    def __str__(self):
        return f"{self.activity_type} - {self.co2_emissions_kg} kg CO2e ({self.status})"


class AuditTrail(models.Model):
    """
    Stores an immutable log of edits and audits for compliance.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(CarbonEmissionRecord, on_delete=models.CASCADE, related_name='audits')
    action_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action_timestamp = models.DateTimeField(auto_now_add=True)
    action_taken = models.CharField(max_length=50) # e.g., IMPORT, EDIT, APPROVE, AUTO_HEAL
    changes_json = models.JSONField(blank=True, null=True) # Diffs payload