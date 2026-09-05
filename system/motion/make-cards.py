"""Regenerate every card and lower-third for the social clips.

Copy is deliberate: each caption names a thing Meridian actually delivers, so a
viewer learns what we build while watching the product work.
"""
import cards

SETS = {
  'bbs': dict(
    title=('Restaurant ordering', 'Your menu, taking orders.', 'Big Boy Subs — Monterey, California'),
    lts=[('Ordering that works on a phone', 'Pickup times, live kitchen wait'),
         ('Every sub, built their way',      'Options, sizes, running total'),
         ('Merch that sells itself',         'Storefront, checkout, fulfilment')],
  ),
  'ms': dict(
    title=('Retail storefront', 'A shop that sells\nwhile you sleep.', 'MODERN_STREET — apparel'),
    lts=[('A storefront, not a catalogue', 'Lookbook, collections, stock'),
         ('Browsing that feels designed',   'Filters, sizes, availability'),
         ('Product pages that convert',     'Gallery, options, add to bag')],
  ),
}

for k, s in SETS.items():
    kicker, headline, sub = s['title']
    cards.title_card(kicker, headline.replace('\n', ' '), sub, f'assets/{k}-title.png')
    for i, (t, st) in enumerate(s['lts']):
        cards.lower_third(t, st, f'assets/{k}-lt{i}.png')
    print(f'{k}: title + {len(s["lts"])} lower-thirds')
cards.end_card('assets/end.png')
print('end card')
