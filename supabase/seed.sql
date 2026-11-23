-- =====================================================================
-- Seed data for N&D Nature Healthy Food.
-- Prices are integer paise. Health statements are general, conservative
-- and evidence-based; "potential benefit" style items are seeded as
-- UNAPPROVED so the admin reviews them before they appear on the site.
-- Nutrition facts are intentionally left empty: add lab-tested values
-- per product from Admin → Products → Health information.
-- =====================================================================

-- ---------- Initial Super Admin (fixed, pre-authorised identifier) ----
insert into public.admin_allowlist (phone, role, display_name)
values ('+919014325025', 'super_admin', 'Owner')
on conflict (phone) do update set role = 'super_admin', is_active = true;

-- ---------- Site settings --------------------------------------------
insert into public.site_settings (key, value) values
('store', '{
  "name": "N&D Nature Healthy Food",
  "tagline": "Pure dehydrated fruit, vegetable & herbal powders",
  "phone": "+91 90143 25025",
  "whatsapp": "919014325025",
  "email": "hello@example.com",
  "address": "Update your business address in Admin → Settings",
  "fssai": ""
}'::jsonb),
('commerce', '{
  "gst_percent": 5,
  "prices_include_tax": true,
  "delivery_fee_paise": 6000,
  "free_delivery_threshold_paise": 99900,
  "cod_enabled": true,
  "cod_fee_paise": 3000,
  "cod_max_order_paise": 500000,
  "max_qty_per_item": 20
}'::jsonb),
('custom_service', '{
  "packaging_charge_per_kg_paise": 2000,
  "transport_charge_paise": 15000,
  "min_quantity_kg": 2,
  "estimates_enabled": true,
  "notes": "Final charges are confirmed after we inspect your raw material."
}'::jsonb)
on conflict (key) do nothing;

-- ---------- Default service rates ------------------------------------
insert into public.service_rates (ingredient_name, processing_type, rate_per_kg_paise) values
  (null, 'dehydration_only', 6000),
  (null, 'dehydration_powder', 9000),
  (null, 'grinding_only', 3500),
  ('Moringa leaves', 'dehydration_powder', 11000),
  ('Amla', 'dehydration_powder', 9500)
on conflict do nothing;

-- ---------- Categories -------------------------------------------------
insert into public.categories (name, slug, description, sort_order) values
  ('Fruit Powders', 'fruit-powders', 'Sun-ripened fruits, gently dehydrated and finely milled.', 1),
  ('Vegetable Powders', 'vegetable-powders', 'Farm vegetables turned into convenient everyday powders.', 2),
  ('Herbal & Leaf Powders', 'herbal-leaf-powders', 'Leaves and herbs dried at controlled temperatures.', 3),
  ('Mixed Powders', 'mixed-powders', 'Thoughtful blends such as our signature ABC Powder.', 4)
on conflict (slug) do nothing;

-- ---------- Products ---------------------------------------------------
insert into public.products (category_id, name, slug, sku, tagline, description, status, is_featured, accent_color, seo_title, seo_description, sort_order)
select c.id, v.name, v.slug, v.sku, v.tagline, v.description, 'active', v.featured, v.accent, v.name || ' | N&D Nature Healthy Food', v.tagline, v.ord
from (values
  ('mixed-powders', 'ABC Powder', 'abc-powder', 'ND-ABC', 'Amla, Beetroot & Carrot — our signature everyday blend.',
   'Our signature blend of dehydrated Amla (Indian gooseberry), Beetroot and Carrot, finely milled into a vibrant powder. Stir it into water, juice or smoothies for a colourful, convenient way to add fruits and vegetables to your day.', true, '#9E1F3F', 1),
  ('mixed-powders', 'Green Leaf Blend', 'green-leaf-blend', 'ND-GLB', 'Moringa, spinach & curry leaves in one blend.',
   'A savoury blend of dehydrated moringa leaves, spinach and curry leaves. Designed for dals, soups, chapati dough and chutneys.', false, '#2F6B2A', 2),
  ('fruit-powders', 'Amla Powder', 'amla-powder', 'ND-AML', 'Tangy Indian gooseberry, dried and finely milled.',
   'Made from fresh amla (Indian gooseberry) that is washed, deseeded, sliced and dehydrated before milling. A tangy powder long used in Indian kitchens.', true, '#7A9A2E', 3),
  ('fruit-powders', 'Mango Powder', 'mango-powder', 'ND-MNG', 'Ripe mango flavour for smoothies and desserts.',
   'Ripe mango pulp, dehydrated and milled into a fragrant, naturally sweet powder for smoothies, milkshakes, desserts and baking.', false, '#E99A1B', 4),
  ('fruit-powders', 'Banana Powder', 'banana-powder', 'ND-BAN', 'Naturally sweet banana in a pantry-friendly form.',
   'Ripe bananas, sliced and dehydrated, then milled into a naturally sweet powder for pancakes, porridge, smoothies and baking.', false, '#D9B23A', 5),
  ('fruit-powders', 'Apple Powder', 'apple-powder', 'ND-APL', 'Crisp apple flavour for oats, bakes and drinks.',
   'Fresh apples, cored, sliced and dehydrated before milling into a lightly sweet powder.', false, '#C51D2D', 6),
  ('vegetable-powders', 'Carrot Powder', 'carrot-powder', 'ND-CRT', 'Bright, sweet carrot powder for everyday cooking.',
   'Fresh carrots, washed, peeled, sliced and dehydrated, then milled into a sweet, bright-orange powder.', true, '#E46A1C', 7),
  ('vegetable-powders', 'Beetroot Powder', 'beetroot-powder', 'ND-BET', 'Deep ruby beetroot for drinks, bakes and natural colour.',
   'Fresh beetroot, washed, peeled, sliced and dehydrated before milling into a deep ruby-red powder.', true, '#8E1B3A', 8),
  ('vegetable-powders', 'Tomato Powder', 'tomato-powder', 'ND-TOM', 'Concentrated tomato flavour for gravies and soups.',
   'Ripe tomatoes, dehydrated and milled into a tangy powder that adds body and flavour to gravies, soups and seasonings.', false, '#D8342B', 9),
  ('vegetable-powders', 'Onion Powder', 'onion-powder', 'ND-ONI', 'Savoury onion flavour without the chopping.',
   'Fresh onions, peeled, sliced and dehydrated, then milled into a fine savoury powder.', false, '#9B4F7A', 10),
  ('vegetable-powders', 'Garlic Powder', 'garlic-powder', 'ND-GRL', 'Aromatic garlic, ready in a spoon.',
   'Peeled garlic cloves, sliced, dehydrated and milled into an aromatic seasoning powder.', false, '#B9A27A', 11),
  ('herbal-leaf-powders', 'Moringa Powder', 'moringa-powder', 'ND-MOR', 'Shade-dried drumstick leaves, finely milled.',
   'Tender moringa (drumstick) leaves, washed, dried at controlled temperatures and milled into a fine green powder.', true, '#3E7B27', 12),
  ('herbal-leaf-powders', 'Spinach Powder', 'spinach-powder', 'ND-SPN', 'Leafy greens in a convenient powder.',
   'Fresh spinach leaves, washed, dehydrated and milled into a mild green powder for doughs, soups and smoothies.', false, '#2F6B2A', 13),
  ('herbal-leaf-powders', 'Curry Leaves Powder', 'curry-leaves-powder', 'ND-CUR', 'The aroma of South Indian kitchens.',
   'Fresh curry leaves, dried and milled into an aromatic powder for rice, chutney powders and tempering.', false, '#355E1F', 14),
  ('herbal-leaf-powders', 'Mint Leaves Powder', 'mint-leaves-powder', 'ND-MNT', 'Cool, refreshing mint for drinks and raitas.',
   'Fresh mint leaves, dried at low temperature to keep their aroma, then milled into a fine powder.', false, '#3BAA6B', 15)
) as v(cat, name, slug, sku, tagline, description, featured, accent, ord)
join public.categories c on c.slug = v.cat
on conflict (slug) do nothing;

-- ---------- Variants: 100 g, 250 g, 500 g, 750 g, 1 kg ------------------
-- base = price of 100 g in rupees; larger packs get a volume discount.
insert into public.product_variants (product_id, label, weight_grams, sku, price_paise, stock, sort_order)
select p.id, s.label, s.grams, p.sku || '-' || s.grams,
       ((round(b.base * s.mult / 10) * 10 - 1) * 100)::int, -- e.g. ₹189, ₹429 (ends in 9)
       s.stock, s.ord
from public.products p
join (values
  ('abc-powder', 189), ('green-leaf-blend', 169), ('amla-powder', 149), ('mango-powder', 199),
  ('banana-powder', 159), ('apple-powder', 199), ('carrot-powder', 149), ('beetroot-powder', 149),
  ('tomato-powder', 139), ('onion-powder', 119), ('garlic-powder', 149), ('moringa-powder', 159),
  ('spinach-powder', 139), ('curry-leaves-powder', 129), ('mint-leaves-powder', 139)
) as b(slug, base) on b.slug = p.slug
cross join (values
  ('100 g', 100, 1.0, 60, 1), ('250 g', 250, 2.3, 50, 2), ('500 g', 500, 4.2, 40, 3),
  ('750 g', 750, 6.0, 25, 4), ('1 kg', 1000, 7.6, 20, 5)
) as s(label, grams, mult, stock, ord)
on conflict do nothing;

-- A launch sale on the 250 g ABC pack to show sale pricing.
update public.product_variants v set sale_price_paise = v.price_paise - 4000
from public.products p where p.id = v.product_id and p.slug = 'abc-powder' and v.weight_grams = 250;

insert into public.inventory (variant_id, change, stock_after, reason, reference)
select id, stock, stock, 'initial', 'seed' from public.product_variants;

-- ---------- Health & usage information --------------------------------
insert into public.product_health_information (product_id, section, kind, body, claim_type, is_approved, sort_order)
select p.id, v.section::public.health_section, v.kind, v.body, v.claim::public.claim_type, v.approved, v.ord
from (values
  -- ABC Powder
  ('abc-powder', 'ingredients', 'bullet', 'Dehydrated amla (Indian gooseberry)', 'general', true, 1),
  ('abc-powder', 'ingredients', 'bullet', 'Dehydrated beetroot', 'general', true, 2),
  ('abc-powder', 'ingredients', 'bullet', 'Dehydrated carrot', 'general', true, 3),
  ('abc-powder', 'nutritional_info', 'paragraph', 'The nutrient content of dehydrated powders varies with the produce, season and batch. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('abc-powder', 'potential_benefits', 'bullet', 'Amla is widely recognised as a natural source of vitamin C.', 'general', false, 1),
  ('abc-powder', 'potential_benefits', 'bullet', 'Carrots contain beta-carotene, which the body can convert into vitamin A.', 'research_supported', false, 2),
  ('abc-powder', 'potential_benefits', 'bullet', 'Beetroot naturally contains dietary nitrates and folate.', 'research_supported', false, 3),
  ('abc-powder', 'health_uses', 'paragraph', 'A convenient way to include fruits and vegetables in a balanced daily diet, especially on busy days.', 'general', false, 1),
  ('abc-powder', 'common_uses', 'bullet', 'Mixed into water or fresh juice as a morning drink', 'general', true, 1),
  ('abc-powder', 'common_uses', 'bullet', 'Blended into smoothies and lassi', 'general', true, 2),
  ('abc-powder', 'common_uses', 'bullet', 'Stirred into curd or added to chapati dough for natural colour', 'general', true, 3),
  ('abc-powder', 'how_to_consume', 'paragraph', 'Add one teaspoon to a glass of water or juice and stir well. Drink soon after mixing.', 'general', true, 1),
  ('abc-powder', 'preparation', 'bullet', 'ABC drink: 1 tsp powder + 200 ml water + a squeeze of lemon. Add honey to taste.', 'general', true, 1),
  ('abc-powder', 'preparation', 'bullet', 'ABC smoothie: 1 tsp powder + 1 banana + 150 ml milk or plant milk, blended.', 'general', true, 2),
  ('abc-powder', 'serving', 'paragraph', 'Suggested serving: 1 teaspoon (about 3–5 g) a day as part of a varied diet.', 'general', false, 1),
  ('abc-powder', 'storage', 'bullet', 'Store in a cool, dry place away from direct sunlight.', 'general', true, 1),
  ('abc-powder', 'storage', 'bullet', 'Close the pouch tightly after each use and always use a dry spoon.', 'general', true, 2),
  ('abc-powder', 'precautions', 'bullet', 'Beetroot can temporarily turn urine or stools pink or red. This is harmless.', 'research_supported', true, 1),
  ('abc-powder', 'precautions', 'bullet', 'If you are pregnant, nursing, taking medication or have a history of kidney stones, consult your doctor before regular use.', 'general', true, 2),
  ('abc-powder', 'allergens', 'paragraph', 'Processed in a facility that also handles other fruits, vegetables and herbs.', 'general', true, 1),

  -- Amla
  ('amla-powder', 'ingredients', 'bullet', '100% dehydrated amla (Indian gooseberry)', 'general', true, 1),
  ('amla-powder', 'nutritional_info', 'paragraph', 'Amla is best known for its vitamin C and polyphenol content. Values vary between batches; refer to the pack label.', 'general', true, 1),
  ('amla-powder', 'potential_benefits', 'bullet', 'A natural source of vitamin C, which contributes to normal immune function.', 'research_supported', false, 1),
  ('amla-powder', 'health_uses', 'paragraph', 'Amla has a long history of use in traditional Indian (Ayurvedic) preparations such as Triphala and chyawanprash.', 'traditional', false, 1),
  ('amla-powder', 'common_uses', 'bullet', 'Mixed with warm water and honey', 'general', true, 1),
  ('amla-powder', 'common_uses', 'bullet', 'Added to chutneys, pickles and juices for tang', 'general', true, 2),
  ('amla-powder', 'common_uses', 'bullet', 'Used externally in traditional hair packs', 'traditional', true, 3),
  ('amla-powder', 'how_to_consume', 'paragraph', 'Mix half to one teaspoon in a glass of water. Its taste is naturally sour and slightly bitter.', 'general', true, 1),
  ('amla-powder', 'preparation', 'bullet', 'Amla honey drink: ½ tsp powder + warm water + 1 tsp honey.', 'general', true, 1),
  ('amla-powder', 'storage', 'bullet', 'Store airtight in a cool, dry place. The powder absorbs moisture and may clump if left open.', 'general', true, 1),
  ('amla-powder', 'precautions', 'bullet', 'Large amounts may upset sensitive stomachs. Start with a small quantity.', 'general', true, 1),
  ('amla-powder', 'precautions', 'bullet', 'If you take medication for diabetes or blood thinning, consult your doctor before regular use.', 'general', true, 2),

  -- Carrot
  ('carrot-powder', 'ingredients', 'bullet', '100% dehydrated carrot', 'general', true, 1),
  ('carrot-powder', 'nutritional_info', 'paragraph', 'Carrots are a well-known source of beta-carotene and dietary fibre. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('carrot-powder', 'potential_benefits', 'bullet', 'Beta-carotene in carrots is converted by the body into vitamin A, which supports normal vision.', 'research_supported', false, 1),
  ('carrot-powder', 'common_uses', 'bullet', 'Soups, dals and gravies', 'general', true, 1),
  ('carrot-powder', 'common_uses', 'bullet', 'Cakes, muffins, halwa and other bakes', 'general', true, 2),
  ('carrot-powder', 'common_uses', 'bullet', 'Natural orange colour for chapati, dosa or idli batter', 'general', true, 3),
  ('carrot-powder', 'how_to_consume', 'paragraph', 'Stir 1–2 teaspoons into dishes while cooking, or blend into juices and smoothies.', 'general', true, 1),
  ('carrot-powder', 'preparation', 'bullet', 'Carrot soup: 2 tbsp powder whisked into 300 ml hot vegetable stock with salt and pepper.', 'general', true, 1),
  ('carrot-powder', 'storage', 'bullet', 'Store airtight in a cool, dry, dark place.', 'general', true, 1),
  ('carrot-powder', 'allergens', 'paragraph', 'Processed in a facility that also handles other fruits, vegetables and herbs.', 'general', true, 1),

  -- Beetroot
  ('beetroot-powder', 'ingredients', 'bullet', '100% dehydrated beetroot', 'general', true, 1),
  ('beetroot-powder', 'nutritional_info', 'paragraph', 'Beetroot naturally contains dietary nitrates, folate and betalain pigments. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('beetroot-powder', 'potential_benefits', 'bullet', 'Dietary nitrates from beetroot have been studied for their role in blood-vessel function and exercise performance.', 'research_supported', false, 1),
  ('beetroot-powder', 'common_uses', 'bullet', 'Beet latte, juices and smoothies', 'general', true, 1),
  ('beetroot-powder', 'common_uses', 'bullet', 'Natural pink colour for cakes, frostings, pasta and rotis', 'general', true, 2),
  ('beetroot-powder', 'preparation', 'bullet', 'Beet latte: 1 tsp powder + 200 ml warm milk + a pinch of cinnamon, whisked.', 'general', true, 1),
  ('beetroot-powder', 'how_to_consume', 'paragraph', 'Mix one teaspoon into a drink, or add to batters and doughs for colour.', 'general', true, 1),
  ('beetroot-powder', 'storage', 'bullet', 'Store airtight away from light and humidity to preserve its colour.', 'general', true, 1),
  ('beetroot-powder', 'precautions', 'bullet', 'Beetroot can temporarily turn urine or stools pink or red. This is harmless.', 'research_supported', true, 1),
  ('beetroot-powder', 'precautions', 'bullet', 'Beetroot contains oxalates; people prone to kidney stones should consult their doctor.', 'research_supported', true, 2),

  -- Moringa
  ('moringa-powder', 'ingredients', 'bullet', '100% dried moringa (drumstick) leaves', 'general', true, 1),
  ('moringa-powder', 'nutritional_info', 'paragraph', 'Moringa leaves contain protein, calcium, iron and vitamin A precursors. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('moringa-powder', 'health_uses', 'paragraph', 'Moringa leaves are traditionally cooked as a leafy green in many Indian households.', 'traditional', false, 1),
  ('moringa-powder', 'common_uses', 'bullet', 'Sprinkled into dal, sambar, soups and stir-fries', 'general', true, 1),
  ('moringa-powder', 'common_uses', 'bullet', 'Blended into smoothies and buttermilk', 'general', true, 2),
  ('moringa-powder', 'common_uses', 'bullet', 'Mixed into chapati and paratha dough', 'general', true, 3),
  ('moringa-powder', 'how_to_consume', 'paragraph', 'Start with half a teaspoon added to food or drinks. The taste is earthy and slightly bitter.', 'general', true, 1),
  ('moringa-powder', 'preparation', 'bullet', 'Moringa buttermilk: ½ tsp powder + 250 ml buttermilk + roasted cumin + salt.', 'general', true, 1),
  ('moringa-powder', 'storage', 'bullet', 'Store airtight away from light to keep its green colour.', 'general', true, 1),
  ('moringa-powder', 'precautions', 'bullet', 'Introduce gradually; large amounts may cause digestive discomfort.', 'general', true, 1),
  ('moringa-powder', 'precautions', 'bullet', 'If you are pregnant, nursing, or take medication for blood sugar, blood pressure or thyroid, consult your doctor before use.', 'general', true, 2),

  -- Mango / Banana / Apple
  ('mango-powder', 'ingredients', 'bullet', '100% dehydrated ripe mango', 'general', true, 1),
  ('mango-powder', 'nutritional_info', 'paragraph', 'Ripe mango naturally contains fruit sugars and carotenoids. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('mango-powder', 'common_uses', 'bullet', 'Mango milkshake, lassi and smoothies', 'general', true, 1),
  ('mango-powder', 'common_uses', 'bullet', 'Ice creams, puddings, cakes and frostings', 'general', true, 2),
  ('mango-powder', 'preparation', 'bullet', 'Mango lassi: 2 tsp powder + 200 ml curd + 50 ml water, blended with sugar to taste.', 'general', true, 1),
  ('mango-powder', 'storage', 'bullet', 'Fruit powders are hygroscopic: keep tightly closed in a dry place.', 'general', true, 1),
  ('mango-powder', 'precautions', 'bullet', 'Contains natural fruit sugars. People managing blood sugar should account for this in their diet.', 'general', true, 1),
  ('banana-powder', 'ingredients', 'bullet', '100% dehydrated ripe banana', 'general', true, 1),
  ('banana-powder', 'nutritional_info', 'paragraph', 'Banana naturally contains carbohydrates and potassium. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('banana-powder', 'common_uses', 'bullet', 'Pancakes, porridge and baking', 'general', true, 1),
  ('banana-powder', 'common_uses', 'bullet', 'Smoothies and milkshakes', 'general', true, 2),
  ('banana-powder', 'storage', 'bullet', 'Keep tightly closed in a cool, dry place.', 'general', true, 1),
  ('apple-powder', 'ingredients', 'bullet', '100% dehydrated apple', 'general', true, 1),
  ('apple-powder', 'nutritional_info', 'paragraph', 'Apples naturally contain dietary fibre, including pectin. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('apple-powder', 'common_uses', 'bullet', 'Stirred into oats, muesli and yoghurt', 'general', true, 1),
  ('apple-powder', 'common_uses', 'bullet', 'Apple-cinnamon cakes and cookies', 'general', true, 2),
  ('apple-powder', 'storage', 'bullet', 'Keep tightly closed in a cool, dry place.', 'general', true, 1),

  -- Tomato / Onion / Garlic
  ('tomato-powder', 'ingredients', 'bullet', '100% dehydrated tomato', 'general', true, 1),
  ('tomato-powder', 'nutritional_info', 'paragraph', 'Tomatoes are a natural source of the carotenoid lycopene. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('tomato-powder', 'common_uses', 'bullet', 'Gravies, curries, rasam and soups', 'general', true, 1),
  ('tomato-powder', 'common_uses', 'bullet', 'Seasoning for snacks, popcorn and pasta', 'general', true, 2),
  ('tomato-powder', 'preparation', 'bullet', 'Instant tomato paste: mix 1 part powder with 2 parts warm water.', 'general', true, 1),
  ('tomato-powder', 'storage', 'bullet', 'Highly moisture-sensitive; keep sealed and use a dry spoon.', 'general', true, 1),
  ('onion-powder', 'ingredients', 'bullet', '100% dehydrated onion', 'general', true, 1),
  ('onion-powder', 'common_uses', 'bullet', 'Gravies, marinades, dips and spice rubs', 'general', true, 1),
  ('onion-powder', 'how_to_consume', 'paragraph', 'Roughly 1 teaspoon of powder replaces one small fresh onion in most recipes.', 'general', true, 1),
  ('onion-powder', 'storage', 'bullet', 'Highly moisture-sensitive; keep sealed. Clumps can be broken up and are safe to use if dry.', 'general', true, 1),
  ('garlic-powder', 'ingredients', 'bullet', '100% dehydrated garlic', 'general', true, 1),
  ('garlic-powder', 'common_uses', 'bullet', 'Garlic bread, marinades, chutneys and stir-fries', 'general', true, 1),
  ('garlic-powder', 'how_to_consume', 'paragraph', 'About ¼ teaspoon of powder replaces one fresh garlic clove.', 'general', true, 1),
  ('garlic-powder', 'storage', 'bullet', 'Keep sealed in a cool, dry place.', 'general', true, 1),
  ('garlic-powder', 'precautions', 'bullet', 'If you take blood-thinning medication, consult your doctor before consuming garlic in large amounts.', 'general', true, 1),

  -- Leaves
  ('spinach-powder', 'ingredients', 'bullet', '100% dehydrated spinach leaves', 'general', true, 1),
  ('spinach-powder', 'nutritional_info', 'paragraph', 'Spinach contains folate, vitamin K and iron. Refer to the pack label for batch-specific values.', 'general', true, 1),
  ('spinach-powder', 'common_uses', 'bullet', 'Palak paratha, pasta dough and green dosa batter', 'general', true, 1),
  ('spinach-powder', 'common_uses', 'bullet', 'Soups, dals and smoothies', 'general', true, 2),
  ('spinach-powder', 'storage', 'bullet', 'Store airtight away from light.', 'general', true, 1),
  ('spinach-powder', 'precautions', 'bullet', 'Spinach is high in vitamin K. If you take warfarin or similar medicines, keep your intake consistent and consult your doctor.', 'research_supported', true, 1),
  ('spinach-powder', 'precautions', 'bullet', 'Spinach contains oxalates; people prone to kidney stones should consult their doctor.', 'research_supported', true, 2),
  ('curry-leaves-powder', 'ingredients', 'bullet', '100% dried curry leaves', 'general', true, 1),
  ('curry-leaves-powder', 'health_uses', 'paragraph', 'Curry leaves are a traditional flavouring in South Indian and Sri Lankan cooking.', 'traditional', true, 1),
  ('curry-leaves-powder', 'common_uses', 'bullet', 'Mixed with hot rice and ghee', 'general', true, 1),
  ('curry-leaves-powder', 'common_uses', 'bullet', 'Chutney powders, buttermilk and tempering', 'general', true, 2),
  ('curry-leaves-powder', 'storage', 'bullet', 'Store airtight to preserve aroma.', 'general', true, 1),
  ('mint-leaves-powder', 'ingredients', 'bullet', '100% dried mint leaves', 'general', true, 1),
  ('mint-leaves-powder', 'common_uses', 'bullet', 'Raita, chutneys and chaat', 'general', true, 1),
  ('mint-leaves-powder', 'common_uses', 'bullet', 'Lemonade, buttermilk and iced tea', 'general', true, 2),
  ('mint-leaves-powder', 'storage', 'bullet', 'Store airtight to preserve aroma.', 'general', true, 1),
  ('green-leaf-blend', 'ingredients', 'bullet', 'Dried moringa leaves', 'general', true, 1),
  ('green-leaf-blend', 'ingredients', 'bullet', 'Dehydrated spinach', 'general', true, 2),
  ('green-leaf-blend', 'ingredients', 'bullet', 'Dried curry leaves', 'general', true, 3),
  ('green-leaf-blend', 'common_uses', 'bullet', 'Dal, sambar, soups and chapati dough', 'general', true, 1),
  ('green-leaf-blend', 'storage', 'bullet', 'Store airtight away from light.', 'general', true, 1),
  ('green-leaf-blend', 'precautions', 'bullet', 'Contains spinach (high in vitamin K). If you take blood-thinning medication, consult your doctor.', 'research_supported', true, 1)
) as v(slug, section, kind, body, claim, approved, ord)
join public.products p on p.slug = v.slug;

-- ---------- A sample festival offer (inactive by default) -------------
insert into public.promotions (name, festival_name, title, description, discount_type, discount_value, scope,
                               requires_coupon, starts_at, ends_at, is_active)
values ('Diwali Special', 'Diwali', 'Diwali Special — 15% off everything',
        'Celebrate the festival of lights with 15% off all powders.', 'percentage', 15, 'all',
        false, now(), now() + interval '30 days', false);
