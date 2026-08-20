-- ============================================================================
-- Media library: reusable images the agent attaches to generated content.
-- ============================================================================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.media_assets enable row level security;

alter table public.content_items add column if not exists image_url text;

-- Seed from the existing All in 1 Events site photos (swap for your own).
insert into public.media_assets (url, title, tags) values
  ('https://lh3.googleusercontent.com/aida-public/AB6AXuDuGjPre-e6BK5EIIOxywwN03pHFysa1wGQKgtqsf5F-MsjqNM3U_60OruCWKxL3U8CSTK59l1GsCdejTaSHYjCVJyrJUFk66N7aATg-nw2Umn2xfnkOMNOl8DoK2cvKSsiMVDogoxwOz-ilIotZCcepWRygZ7iL89axncxj0ktpef9Mhn518W5fJXGDqOw2A8pM7_zo7tFLvkCl2yjLnIUhlusmdZEDnWk8z-8qtFduj7JEO3cEbqnfrF0sTZbNfmhPAMls__Rwa4',
    'Magic Mirror Photo Booth', array['photo booth','booth','interactive','popular']),
  ('https://lh3.googleusercontent.com/aida-public/AB6AXuBt3d2qP9BPG_yRlUVaVQMiRhsdOYVvYJtnrHCFQi6h3Y0Pv-toaAmyEW1zHmzXdH_k_CsqAIQ16GP94Lw4yZtBRU7gktgEtmPEOwYHGLVnavSCWuqN8BQ2f2wKcULmGMlxpjHJT1U2HREg8t3jqFQaMifBJyD9YJmflOkV1MYfkU-IvwpYQMzE-DenlXyqcGorJxcvy88-gEGBB4ARU_t8J76J9u-_0AS9CXBfz4Yl01I6wLT8qdKU9oN14-pQoJB3Pjaokl8eCp8',
    'Atmospheric Lighting', array['lighting','dj','uplighting','nightlife']),
  ('https://lh3.googleusercontent.com/aida-public/AB6AXuDHuJgGhmJJyNA_I2ceHlCSq4RzT8q016SfG-zfJfi8Ol-wbSTEKMDaNElRAaiiXZPTtu3g62BXSGa4Zm6kN7Y9S8YNjkKXLarcrqQzAyX7fxi723YeMRisRRPXmOjYewSxgmZwp5zIrLmLVPoblwsDUIWqV5wMxevby4AraqegUjUcZpMwSJywV6lFBnq3jbPtQVjuRe2xhumTXSocL-xAQo1aA-HwzcNXQgPZw3mUlmez20hlFYhkXZ18tHw_OSv4U0ro0Zmrl2Y',
    'VIP Lounge', array['vip','lounge','seating','luxury'])
on conflict do nothing;
