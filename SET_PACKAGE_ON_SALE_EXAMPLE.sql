-- Example: Put a package on sale
-- Replace the values below with your actual package ID and sale details

UPDATE pricing_packages
SET 
  sale_name = 'Black Friday Sale',           -- Name of the sale
  sale_start_date = '2024-11-29',            -- Start date (YYYY-MM-DD)
  sale_end_date = '2024-12-02',              -- End date (YYYY-MM-DD)
  sale_max_quantity = 100,                   -- Max plans to sell (NULL = unlimited)
  sale_sold_count = 0                        -- Reset sold count to 0
WHERE id = 'YOUR_PACKAGE_ID_HERE';           -- Replace with your package UUID

-- To clear a sale (disable it):
-- UPDATE pricing_packages
-- SET 
--   sale_name = NULL,
--   sale_start_date = NULL,
--   sale_end_date = NULL,
--   sale_max_quantity = NULL,
--   sale_sold_count = 0
-- WHERE id = 'YOUR_PACKAGE_ID_HERE';

