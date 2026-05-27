# Database Model & Design

In this project, I designed a database to store and calculate carbon emissions. I used SQLite because it is simple to run. Below are the tables I created and why I made them.

---

## 1. Tables in the Database

### A. Organization
This table is for the companies that use our app.
* **Fields**:
  * `id`: A unique UUID.
  * `name`: The name of the company.
  * `created_at`: When the company was added.
* **Why**: We need this to keep the data of different companies separate. This is called multi-tenancy. A company should only see its own carbon data.

### B. DataSource
This table keeps track of the files uploaded to the app.
* **Fields**:
  * `id`: A unique UUID.
  * `organization`: Which company uploaded the file.
  * `source_type`: Can be `SAP`, `UTILITY` (electricity), or `TRAVEL`.
  * `file_name`: The name of the file uploaded.
  * `uploaded_at`: The date and time of the upload.
  * `uploaded_by`: The user who uploaded the file.
* **Why**: This helps us know where the data came from. If there is a mistake in a row, we can see the exact file it came from.

### C. CarbonEmissionRecord
This is the main table. It stores all the calculated carbon data from SAP, electricity, and travel files in one place.
* **Fields**:
  * `id`: A unique UUID.
  * `organization`: The company this record belongs to.
  * `source_mapping`: Links back to the uploaded file.
  * `raw_record_id`: The ID of this row in the original file.
  * `raw_data_payload`: The original row saved as JSON.
  * `scope_category`: Scope 1 (direct), Scope 2 (electricity), or Scope 3 (travel).
  * `activity_type`: Standard name like "Diesel", "Electricity", or "Flight".
  * `start_date` / `end_date`: The dates for this activity.
  * `raw_quantity` / `raw_unit`: The original quantity and unit from the file.
  * `normalized_quantity`: The quantity after converting units (like converting cubic meters to liters).
  * `cost_in_inr`: The money spent in Rupees.
  * `co2_emissions_kg`: The calculated carbon footprint in kilograms.
  * `status`: Can be `PENDING` (needs check), `FLAGGED` (has mistake), or `APPROVED` (checked and locked).
  * `anomaly_reason`: Why this row was flagged as suspicious.
  * `reviewed_by` / `reviewed_at`: Who approved the record and when.
* **Why**: We save the original row as JSON inside `raw_data_payload`. This is very helpful because if our carbon formula changes later, we can recalculate it using the saved JSON without asking the user to upload the file again.

### D. AuditTrail
This table keeps a history of all changes made to any record.
* **Fields**:
  * `id`: A unique UUID.
  * `record`: The record that was changed.
  * `action_by`: Who did the action.
  * `action_timestamp`: When they did it.
  * `action_taken`: E.g., `IMPORT`, `EDIT`, `APPROVE`, `AUTO_HEAL`.
  * `changes_json`: Shows what the old value was and what the new value is.
* **Why**: Carbon audits are very strict. This table ensures we have a complete log of who changed what, so no one can secretly alter the carbon numbers.

---

## 2. Carbon Calculation Rules

I used standard formulas to calculate the carbon emissions in kilograms:

1. **Scope 1 (SAP Fuel)**:
   * **Diesel**: `2.68` kg CO2 per Liter.
   * **Petrol**: `2.31` kg CO2 per Liter.
   * **CNG**: `2.00` kg CO2 per Cubic Meter ($M^3$).
   * **Other Lubricants**: `1.80` kg CO2 per Liter.
   * *Rule*: If the unit is Cubic Meters ($M^3$), we multiply the quantity by 1,000 to get Liters before calculating.
   
2. **Scope 2 (Electricity)**:
   * **Grid Electricity**: `0.82` kg CO2 per kWh.
   * *Rule*: If a bill has zero kWh but we know the cost in Rupees, we estimate the kWh using a rate of `₹9.0` per kWh.
   
3. **Scope 3 (Business Travel)**:
   * **Flight**: `0.24` kg CO2 per mile.
   * **Train**: `0.06` kg CO2 per mile.
   * **Hotel**: `14.20` kg CO2 per night.
