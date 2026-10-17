-- The owner can reword feedback before accepting it; the sender's words stay in body.
alter table journal_entries add column if not exists edited_body text;
