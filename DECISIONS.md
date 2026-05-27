# Decisions and Assumptions

When I was writing the upload and parsing code, I found some confusing things in the files. Here is how I solved them and the assumptions I made.

---

## 1. How I Solved Problems in the Data

### A. SAP Fuel Data
* **Date format (`BUDAT` column)**:
  In the SAP file, the dates look like `20250308`. This is just a plain number, not a real date format.
  * *My Solution*: I wrote code to read this number and convert it into a real date (like `2025-03-08`). I set both the start date and end date of the record to this date because it is a one-time purchase.
* **Scope category**:
  Buying fuel is usually Scope 1 (Direct), but the SAP file also has aviation fuel for business travel.
  * *My Solution*: If the row says `AVIATION` in the material group column (`MATKL`), I set the scope to **Scope 3** because business flights are part of the value chain. If it is standard `FUEL` or `GAS`, it stays **Scope 1**.
* **Mixed Units**:
  The SAP file mixes Liters (`L`) and Cubic Meters (`M3`).
  * *My Solution*: I convert Cubic Meters to Liters by multiplying by 1,000, so all quantities use the same unit.

### B. Electricity Bills (Utility)
* **Billing dates crossing months**:
  Some bills go from January 12th to February 11th. They do not start on the 1st of the month.
  * *My Solution*: I decided to save the exact start and end dates from the bill. I did not try to split the numbers into two different months because that would require guessing. Saving the exact dates is safer and matches the real invoice.
* **Missing kWh numbers**:
  The Lucknow factory bill had a cost of `₹31,500` but the kWh amount was blank.
  * *My Solution*: The app flags this as a suspicious record (`FLAGGED`). But I also built an "Auto-Healing" feature in the backend. If the user clicks "Auto-Resolve", it estimates the kWh using a commercial price of `₹9` per kWh:
    $$31500 \text{ Rupees} \div 9 = 3500 \text{ kWh}$$
    This way, the user does not have to search for the missing number. They can just check and approve my estimate.

### C. Travel Logs (Concur/Navan)
* **Missing miles for flights**:
  Some flight rows show where the flight started and ended (like `DEL` to `LHR`) but the miles column is left empty.
  * *My Solution*: The app flags these rows. But I created a small database of route distances in the backend (for example, DEL to LHR is 4,170 miles). If the flight route matches one of these, the "Auto-Resolve" button will automatically fill in the correct miles and calculate the carbon.
* **Hotel stays**:
  Hotel bookings show cost and traveler names but have `0` miles.
  * *My Solution*: Hotels do not use miles. I changed the unit to `Nights` instead of `Miles` and calculated the carbon based on the number of nights.

---

## 2. Questions I Would Ask a Project Manager

If I was working with a real Product Manager (PM), I would ask them these questions:

1. **Other Currencies**:
   Right now, the cost is always in Rupees (INR). If we import files from other countries that use USD or EUR, do you want us to add a currency converter that updates rates automatically?
2. **Plant Locations**:
   The SAP file has plant codes (like `WERKS`). Should we map these codes to actual factory addresses so we can show carbon emissions by factory on the dashboard?
3. **Changing Carbon Rates**:
   What happens if the official carbon factors change next year? Should we recalculate old approved records, or should they stay locked forever so they match past audit reports?
