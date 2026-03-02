-- Add {{variant}} to all 4 graded comic eBay listing templates (title + description)

-- Hawaii PSA
UPDATE ebay_listing_templates
SET title_template = '{{subject}} #{{card_number}} {{variant}} ({{year}}) {{brand_title}} PSA {{grade}} Graded Comic',
    description_template = '<h2>PSA Graded Comic Book</h2>

<p><strong>Title:</strong> {{subject}}</p>
<p><strong>Issue:</strong> #{{card_number}}</p>
<p><strong>Variant:</strong> {{variant}}</p>
<p><strong>Publisher:</strong> {{brand_title}}</p>
<p><strong>Year:</strong> {{year}}</p>
<p><strong>Grade:</strong> PSA {{grade}}</p>
<p><strong>PSA Cert #:</strong> {{psa_cert}}</p>

<hr>

<p>This comic has been professionally graded and encapsulated by PSA.</p>

<p>You will receive the exact item shown in the photos. Please review all images carefully for case condition.</p>

<p>✔ Securely packed<br>
✔ Ships quickly<br>
✔ Combined shipping available</p>

<p>If you have any questions, feel free to message us.</p>'
WHERE id = '04748fde-ae80-40a2-afa1-4a3ffbaf1f50';

-- Las Vegas PSA
UPDATE ebay_listing_templates
SET title_template = '{{subject}} #{{card_number}} {{variant}} {{year}} {{brand_title}} PSA {{grade}}',
    description_template = '<p>PSA Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Variant:</b> {{variant}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> PSA {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>'
WHERE id = 'b39ff823-ad4c-416a-ade2-69bafc4dab73';

-- Hawaii CGC
UPDATE ebay_listing_templates
SET title_template = '{{subject}} #{{card_number}} {{variant}} {{year}} {{brand_title}} CGC {{grade}}',
    description_template = '<p>CGC Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Variant:</b> {{variant}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> CGC {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>'
WHERE id = '878bb82c-7bb5-419a-9f37-9f7c4e5a1256';

-- Las Vegas CGC
UPDATE ebay_listing_templates
SET title_template = '{{subject}} #{{card_number}} {{variant}} {{year}} {{brand_title}} CGC {{grade}}',
    description_template = '<p>CGC Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Variant:</b> {{variant}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> CGC {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>'
WHERE id = 'ec2ec1a8-8f43-4f23-af28-4c1fa9757aad';