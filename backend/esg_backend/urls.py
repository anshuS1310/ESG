from django.contrib import admin
from django.urls import path
from esg_backend.views import (
    health_check,
    list_emissions_api,
    review_record_api,
    bulk_approve_api,
    auto_resolve_api,
    edit_record_api,
    ingest_pipeline_trigger,
    dashboard_statistics_api
)

urlpatterns = [
    # Root Health Check Endpoint
    path('', health_check, name='health_check'),

    # Ingestion Trigger API
    path('api/emissions/ingest/', ingest_pipeline_trigger, name='ingest_pipeline'),
    
    # Dashboard Analytics Summary API
    path('api/emissions/stats/', dashboard_statistics_api, name='dashboard_statistics'),
    
    # List and Search Central Matrix API
    path('api/emissions/', list_emissions_api, name='list_emissions'),
    
    # Bulk Action Auditor Approval
    path('api/emissions/bulk-approve/', bulk_approve_api, name='bulk_approve'),
    
    # Single-Row Interactive Workflows
    path('api/emissions/<str:record_id>/review/', review_record_api, name='review_record'),
    path('api/emissions/<str:record_id>/auto-resolve/', auto_resolve_api, name='auto_resolve'),
    path('api/emissions/<str:record_id>/edit/', edit_record_api, name='edit_record'),
]