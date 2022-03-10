import requests
import random
import string
import json
import concurrent.futures
from itertools import repeat
import argparse

def create_patients(base_url, count=10):
  patient_ids = []
  for i in range(count):
    id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
    name = ''.join(random.choices(string.ascii_uppercase, k=12))
    severity = random.choice(["basic", "moderate", "emergency"])
    data = {
      "id": id,
      "name": name,
      "address": "Dummy Address",
      "severity": severity
    }
    headers = requests.utils.default_headers()
    headers.update({
      'User-Agent': 'My User Agent 1.0',
      'content-type': 'application/json'
    })
    requests.post(f'{base_url}:3000/patients', data=json.dumps(data), headers=headers)
    patient_ids.append(id)
  
  return patient_ids

def create_hospitals(base_url, count=10):
  hospital_ids = []
  for i in range(count):
    id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
    name = ''.join(random.choices(string.ascii_uppercase, k=12))
    category = random.choice(["free", "paid", "premium"])

    data = {
      "name": name,
      "address": "Dummy Address",
      "category": category,
      "basic": random.randint(0, 10),
      "moderate": random.randint(0, 10),
      "emergency": random.randint(0, 10)
    }
    headers = requests.utils.default_headers()
    headers.update({
      'User-Agent': 'My User Agent 1.0',
      'content-type': 'application/json'
    })
    result = requests.post(f'{base_url}:3000/hospitals', data=json.dumps(data), headers=headers).json()
    hospital_id = result['hospital_id']
    hospital_ids.append(hospital_id)
  
  return hospital_ids

def get_availability(base_url):
  headers = requests.utils.default_headers()
  headers.update({
    'User-Agent': 'My User Agent 1.0'
  })
  result = requests.get(f'{base_url}:4000/booking/availability-stat', headers=headers).json()
  return result

def booking_helper(base_url, category, severity, patient_id):
  data = {
    "category": category,
    "capacity": severity,
    "patient_id": patient_id
  }
  headers = requests.utils.default_headers()
  headers.update({
    'User-Agent': 'My User Agent 1.0',
    'content-type': 'application/json'
  })
  result = requests.post(f'{base_url}:4000/booking/create-booking', data=json.dumps(data), headers=headers)
  print(result.text)

def create_booking(base_url, category, severity, patient_ids, count=10, max_workers=10):
  selected_patient_ids = random.choices(patient_ids, k=count)
  with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
    executor.map(booking_helper, repeat(base_url), repeat(category), repeat(severity), selected_patient_ids)

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument("-pt", "--patients", help = "Number of patients to create", default=5)
  parser.add_argument("-hp", "--hospitals", help = "Number of hospitals to create", default=0)
  parser.add_argument("-b", "--book", help = "Number of bookings to create", default=5)
  parser.add_argument("-c", "--category", help = "Category of booking", default='free', choices=['free', 'paid', 'premium'])
  parser.add_argument("-s", "--severity", help = "Severity of the patient", default='basic', choices=['basic', 'moderate', 'emergency'])
  args = parser.parse_args()

  patient_ids = create_patients('http://localhost', int(args.patients))
  print(f'Created patients: {patient_ids}')
  hospital_ids = create_hospitals('http://localhost', int(args.hospitals))
  print(f'Created hospitals: {hospital_ids}')
  stat = get_availability('http://localhost')
  print(f'\nAvailable beds before booking: {json.dumps(stat, indent=2)}\n')
  if int(args.book) > 0:
    create_booking('http://localhost', args.category, args.severity, patient_ids, int(args.book), 10)
    stat = get_availability('http://localhost')
    print(f'\nAvailable beds after booking: {json.dumps(stat, indent=2)}\n')


