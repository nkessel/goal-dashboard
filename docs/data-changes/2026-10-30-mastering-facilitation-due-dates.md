# Mastering Facilitation due dates moved back one week (2026-10-30)

The owner confirmed the 15 weekly quests on the "Mastering Facilitation Skills Course" board (the AR class) were one week late since the Oct 13 import. All 15 `tasks.due_at` were moved back 7 days.

Old values (before the change):

| id | title | old due_at (UTC) |
|---|---|---|
| 4d4051ec-4d8b-4160-8ddf-b33ed3b02b74 | Week 01 · Setting the Stage | 2026-09-22 17:00 |
| a4d586a0-5307-4955-a7e4-19b6d006c29f | Week 02 · Core Concepts | 2026-09-29 17:00 |
| b80f9bc7-9198-4b24-bf04-e91d9b1bbaee | Week 03 · Inner Work | 2026-10-06 17:00 |
| b4b4b87a-4c1d-42a2-9f4e-16c435bd258b | Week 04 · The Steps of Facilitation | 2026-10-13 17:00 |
| afbafae6-2bfa-4bd3-8411-a84084374a16 | Week 05 · Designing Outcomes | 2026-10-20 17:00 |
| a141dd1f-2327-48bb-985c-0a9829023a8a | Week 06 · Building a Plan | 2026-10-27 17:00 |
| 99fd9872-4050-46d5-b167-80a2e1a2d64e | Week 07 · Promotion | 2026-11-03 17:00 |
| e9fd5c6f-44b0-40b1-9edc-93769a67f28f | Week 08 · Feedback | 2026-11-10 17:00 |
| 01ab9e43-4d32-4d99-a0fc-56f116fb7321 | Week 09 · The Ethical Use of Power | 2026-11-17 17:00 |
| 05e8d0a9-ec3d-4d13-bcae-ba0a3a24d5b0 | Week 10 · Creating Clear Containers | 2026-11-24 17:00 |
| a688c7e3-f588-4b25-9a28-d0dfae0431ba | Week 11 · Group Mastery | 2026-12-01 17:00 |
| 00793733-9375-46ee-8bd5-caa28b3ed781 | Week 12 · The Power of Conflict | 2026-12-08 17:00 |
| d65d5790-8f95-4d4a-84a7-14206b589098 | Week 13 · Fight Lab | 2026-12-15 17:00 |
| 4c841514-72e8-41ef-a1af-d95f7c75bc74 | Week 14 · Responsiveness | 2026-12-22 17:00 |
| 74a4cedc-b946-4cc1-94ca-bdb6ec151786 | Week 15 · Graduation | 2026-12-29 17:00 |

Undo:

```sql
update tasks set due_at = due_at + interval '7 days'
where board_id = '570afc1c-1042-4371-baa4-c82326470d5f'
  and id in ('4d4051ec-4d8b-4160-8ddf-b33ed3b02b74','a4d586a0-5307-4955-a7e4-19b6d006c29f','b80f9bc7-9198-4b24-bf04-e91d9b1bbaee','b4b4b87a-4c1d-42a2-9f4e-16c435bd258b','afbafae6-2bfa-4bd3-8411-a84084374a16','a141dd1f-2327-48bb-985c-0a9829023a8a','99fd9872-4050-46d5-b167-80a2e1a2d64e','e9fd5c6f-44b0-40b1-9edc-93769a67f28f','01ab9e43-4d32-4d99-a0fc-56f116fb7321','05e8d0a9-ec3d-4d13-bcae-ba0a3a24d5b0','a688c7e3-f588-4b25-9a28-d0dfae0431ba','00793733-9375-46ee-8bd5-caa28b3ed781','d65d5790-8f95-4d4a-84a7-14206b589098','4c841514-72e8-41ef-a1af-d95f7c75bc74','74a4cedc-b946-4cc1-94ca-bdb6ec151786');
```
