from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from esg_backend.models import Organization

class Command(BaseCommand):
    help = 'Seeds initial test company organization structure'

    def handle(self, *args, **options):
        org, created = Organization.objects.get_or_create(name="Breathe ESG Test Labs")
        if not User.objects.filter(username="analyst").exists():
            User.objects.create_superuser("analyst", "analyst@breathe.internal", "password123")
        self.stdout.write(self.style.SUCCESS('Successfully seeded multi-tenant environment.'))