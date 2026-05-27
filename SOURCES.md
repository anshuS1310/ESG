# Data Formats and Real-World Sources

This document describes the formats of the three data sources, how the sample files match them, and what problems could happen in a real-world system.

---

## 1. SAP Fuel Data (Scope 1)
* **Real-world format**:
  In a real company, SAP systems export purchase orders. They use database codes like:
  * `BUDAT`: The date when the fuel was bought (usually looks like `20250308`).
  * `EBELN` / `EBELP`: The purchase order number and item row number.
  * `KOSTL`: The department cost center.
  * `MAKTX`: The name of the fuel (like "Diesel").
  * `MENGE` / `MEINS`: The quantity and the unit (Liters or Cubic Meters).
  * `NETPR`: The price.
* **Our Sample Data**:
  The `SAP.csv` file has all these columns. It uses mixed units (L and M3) and leaves some cost center columns blank so we can test our validation checks.
* **Real-World Problems**:
  * **Strange Units**: Some orders might use units like "Barrel" or "Drum" which we must convert to Liters.
  * **Different Currencies**: If a company buys fuel in another country, the cost might be in USD instead of INR, which would require currency conversion.

## 2. Electricity Bills (Scope 2)
* **Real-world format**:
  Facilities teams download energy data from their utility provider portals. This data usually contains:
  * `meter_id`: The ID of the electricity meter.
  * `provider`: The name of the electricity company.
  * `billing_start` / `billing_end`: The dates for the bill.
  * `kwh_amount`: The amount of energy used.
  * `cost_inr`: The total cost in Rupees.
* **Our Sample Data**:
  The `Utility.csv` file has these columns. I made one row for the Lucknow factory where the kWh amount is empty but the cost is there, to test if our Auto-Healing estimator works.
* **Real-World Problems**:
  * **Solar Panels**: If a factory has solar panels, they might send electricity back to the grid. This makes the kWh negative, which can confuse simple carbon calculators.
  * **Missing Days**: A bill might end on one day and the next bill starts two days later, leaving a gap.

## 3. Corporate Travel (Scope 3)
* **Real-world format**:
  Corporate travel tools (like Concur) export lists of bookings made by employees. The records include:
  * `segment_type`: If it is a flight, train, or hotel booking.
  * `traveler_name`: Who traveled.
  * `origin` / `destination`: Standard airport codes (like DEL, BOM, LHR).
  * `miles`: The distance of the trip.
  * `ticket_cost_inr`: The cost of the ticket.
* **Our Sample Data**:
  The `travel.csv` file has these columns. It has flight rows with blank miles, so we can test our airport distance lookup feature.
* **Real-World Problems**:
  * **Layovers**: A flight from Delhi to London might stop in Dubai (`DEL ➔ DXB ➔ LHR`). If the file only shows one row DEL to LHR, we might calculate a shorter distance and underestimate the carbon.
  * **No Airport Codes**: If a travel agent types "Paris" instead of `CDG`, we need code to match the city name to the correct airport code.
