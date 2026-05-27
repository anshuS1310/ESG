# Features I Did Not Build and Why

To finish this project on time and make sure the core functions work perfectly, I had to leave out some advanced features. Here are the three things I did not build, why I made this choice, and how we could build them in the future.

---

## 1. Excluded: Reading PDF Bills using AI/OCR
* **What it is**:
  Instead of uploading a CSV, the user would upload a PDF electricity bill, and the app would read it.
* **Why I left it out**:
  Every electricity board has a different bill design. Building a scanner that works for all of them takes a long time and makes many mistakes. For this project, using a clean CSV template (`Utility.csv`) is much safer and works 100% of the time.
* **How to build it later**:
  We can use a cloud scanner service (like AWS Textract). We would write custom rules for different electricity providers to find the billing date, kWh, and cost on the PDF.

## 2. Excluded: Live Connection to Concur/Navan APIs
* **What it is**:
  Instead of downloading and uploading CSV files for business travel, the app would fetch the flights and hotel data directly from travel booking sites.
* **Why I left it out**:
  Connecting to business systems like Concur requires official developer sandbox accounts, API keys, and complex security logins (OAuth). It is too complicated for a prototype. Using a standard CSV travel export is simple and works fine.
* **How to build it later**:
  We would get API credentials from the client, store them securely, and build a background script (using Celery) that automatically downloads new trips every night.

## 3. Excluded: Live Carbon Factors Lookup API
* **What it is**:
  Instead of saving emission factors inside the code, the app would call an online database (like Climatiq) every time we upload a file to get the latest carbon rates.
* **Why I left it out**:
  If the online database goes down or the internet is slow, our file upload will crash or take a very long time. Hardcoding standard factors (from EPA/DEFRA) makes the upload super fast and reliable.
* **How to build it later**:
  We can keep standard rates in our local database as a fallback, and write a background job that updates these rates from the internet once a month.
