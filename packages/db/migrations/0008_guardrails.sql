-- V2 : garde-fous anti-injection.
alter table policies add column if not exists max_requests_per_hour int check (max_requests_per_hour is null or max_requests_per_hour between 1 and 1000);
alter table policies add column if not exists require_receipt_hours int check (require_receipt_hours is null or require_receipt_hours between 1 and 2160);
