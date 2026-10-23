// Replaces the menu (categories + products) with the Maltiva Crust & Bakes printed menu.
// Usage: node scripts/import-menu.cjs   (a backup copy of the DB is made first)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'maltiva_pos.db');
fs.copyFileSync(dbPath, `${dbPath}.before-menu-import.bak`);
const db = new Database(dbPath);

const rs = n => Math.round(n * 100); // rupees -> paisa
const now = new Date().toISOString();

const categories = [
  { id: 'cat-all', name: 'All Menu', icon: '🍲', order: 0 },
  { id: 'cat-deals', name: 'Deals', icon: '🔥', order: 1 },
  { id: 'cat-classic-pizza', name: 'Classic Pizzas', icon: '🍕', order: 2 },
  { id: 'cat-premium-pizza', name: 'Premium Pizzas', icon: '🍕', order: 3 },
  { id: 'cat-sandwiches', name: 'Sandwiches', icon: '🥪', order: 4 },
  { id: 'cat-wraps', name: 'Wraps', icon: '🌯', order: 5 },
  { id: 'cat-bakery', name: 'Bakery Items', icon: '🍞', order: 6 },
  { id: 'cat-drinks', name: 'Drinks', icon: '🥤', order: 7 },
  { id: 'cat-uncategorized', name: 'Uncategorized', icon: '📦', order: 99 },
];
const catName = Object.fromEntries(categories.map(c => [c.id, c.name]));

const sizeGroup = (id, options, base) => ({
  id: `var-${id}-size`, name: 'Size', required: true, multiSelect: false,
  options: options.map(([name, price]) => ({ id: `opt-${id}-${name.toLowerCase()}`, name, priceDeltaPaisa: rs(price - base), costDeltaPaisa: 0 })),
});
const crustGroup = id => ({
  id: `var-${id}-crust`, name: 'Crust', required: true, multiSelect: false,
  options: [
    { id: `opt-${id}-thin`, name: 'Thin Crust', priceDeltaPaisa: 0, costDeltaPaisa: 0 },
    { id: `opt-${id}-original`, name: 'Original Crust', priceDeltaPaisa: 0, costDeltaPaisa: 0 },
  ],
});
const extrasGroup = id => ({
  id: `var-${id}-extras`, name: 'Extras', required: false, multiSelect: true,
  options: [
    { id: `opt-${id}-sprinkle`, name: 'Drizzle / Seasoning Sprinkles', priceDeltaPaisa: rs(100), costDeltaPaisa: 0 },
    { id: `opt-${id}-xtra`, name: 'Extra Chicken or Cheese', priceDeltaPaisa: rs(250), costDeltaPaisa: 0 },
  ],
});

const products = [];
const add = (id, categoryId, name, price, description, variations = [], isDeal = false) =>
  products.push({ id, categoryId, name, price, description, variations, isDeal });

// Classic pizzas: Small / Medium / Large
[
  ['malai-cremoso', 'Malai Cremoso', 'Malai tikka, onion, sweet corn, black olives, white basil sauce & a lot of cheese.'],
  ['tikka-royale', 'Tikka Royale', 'Tikka cubes, tomato, capsicum, onion, jalapenos & a lot of cheese.'],
  ['fajita-fusion', 'Fajita Fusion', 'Fajita chicken, onion, jalapenos, tomato, capsicum, special sauce & a lot of cheese.'],
  ['bbq-nova', 'BBQ Nova', 'BBQ chicken, onion, black olives, jalapenos, special sauce & a lot of cheese.'],
].forEach(([id, name, desc]) => add(`pizza-${id}`, 'cat-classic-pizza', name, 899, desc,
  [sizeGroup(id, [['Small', 899], ['Medium', 1299], ['Large', 1899]], 899), crustGroup(id), extrasGroup(id)]));

// Premium pizzas: Medium / Large (prices read from a low-resolution photo - verify)
[
  ['mega-melt-chicken', 'Mega Melt Chicken', 1799, 2499, 'Premium loaded chicken pizza with extra melted cheese.'],
  ['maltiva-signature-pizza', 'Maltiva Signature Pizza', 1639, 2299, 'Maltiva signature premium pizza.'],
  ['kabab-crust', 'Kabab Crust', 1699, 2350, 'Kabab-stuffed crust premium pizza.'],
  ['pepperoni-blaze', 'Pepperoni Blaze', 1499, 1999, 'Beef pepperoni, cheese & special sauce.'],
].forEach(([id, name, m, l, desc]) => add(`pizza-${id}`, 'cat-premium-pizza', name, m, desc,
  [sizeGroup(id, [['Medium', m], ['Large', l]], m), crustGroup(id), extrasGroup(id)]));

// Sandwiches
add('sandwich-panini-tikka', 'cat-sandwiches', 'Panini Tikka Sandwich', 660, 'Tikka cubes, tomato, capsicum, onion, jalapenos, black olives, iceberg, special sauce & a lot of love.');
add('sandwich-malai-cremoso', 'cat-sandwiches', 'Malai Cremoso Sandwich', 660, 'Malai cubes, tomato, capsicum, onion, black olives, iceberg, sweet corn, special sauce & a lot of love.');
add('sandwich-fit-fuel', 'cat-sandwiches', 'Fit Fuel Sandwich', 660, 'Grilled chicken, capsicum, onion, black olives, jalapenos, iceberg, special sauce, tomatoes without mayo & a lot of love.');
add('sandwich-maltiva-signature', 'cat-sandwiches', 'Maltiva Signature Sandwich', 899, 'Malai tikka, grilled chicken, onion, capsicum, sweet corn, cheese mushrooms, black olives, sausages, iceberg, special sauce & a lot of love.');

// Wraps
add('wrap-special', 'cat-wraps', 'Our Special Wrap', 599, 'Maltiva special wrap.');

// Deals (fixed price)
add('deal-2-sandwiches', 'cat-deals', '2 Classic Sandwiches + 350ml Bottle', 1350, '2 classic sandwiches + 350 ml bottle.', [], true);
add('deal-2-medium-pizzas', 'cat-deals', '2 Classic Medium Pizzas + 1L Bottle', 2499, '2 classic medium pizzas + 1 liter bottle.', [], true);
add('deal-2-large-classic', 'cat-deals', '2 Large Classic Pizzas + 1.5L Bottle', 3699, 'Any 2 large classic pizzas + 1.5 liter bottle.', [], true);
add('deal-2-large-premium', 'cat-deals', '2 Large Premium Pizzas + 1.5L Bottle', 4599, 'Any 2 large premium pizzas + 1.5 liter bottle.', [], true);

// Bakery (banana bread / cookie prices read from a low-resolution photo - verify)
add('bakery-pan-banana-bread', 'cat-bakery', 'Pan Banana Bread', 149, 'Pan banana bread.');
add('bakery-classic-tropical-banana-bread', 'cat-bakery', 'Classic Tropical Banana Bread', 175, 'Classic tropical banana bread.');
add('bakery-choco-banana-bread', 'cat-bakery', 'Choco Rich Banana Bread', 169, 'Chocolate banana bread.');
add('bakery-chunks-banana-bread', 'cat-bakery', 'Chocolate Chunks Banana Bread', 169, 'Banana bread with chocolate chunks.');
add('bakery-mix-nuts-banana-bread', 'cat-bakery', 'Mix Nuts Banana Bread', 219, 'Banana bread with mixed nuts.');
add('bakery-classic-choc-chip-cookie', 'cat-bakery', 'Classic Chocolate Chip Cookie', 250, 'Classic chocolate chip cookie.');
add('bakery-double-choc-chip-cookie', 'cat-bakery', 'Double Chocolate Chip Cookie', 300, 'Double chocolate chip cookie.');
add('bakery-walnut-choc-chip-cookie', 'cat-bakery', 'Walnut Chocolate Chip Cookie', 350, 'Walnut chocolate chip cookie.');
add('bakery-macadamia-cookie', 'cat-bakery', 'Macadamia Cookie', 350, 'Macadamia cookie.');
add('bakery-brownie', 'cat-bakery', 'Brownie', 450, 'Rich chocolate brownie.');
add('bakery-chicken-bread', 'cat-bakery', 'Chicken Bread', 350, 'Freshly baked chicken bread.',
  [sizeGroup('chicken-bread', [['Small', 350], ['Large', 500]], 350)]);

// Drinks
add('drink-soft', 'cat-drinks', 'Soft Drink', 200, 'Chilled soft drink.',
  [sizeGroup('drink', [['1 Ltr', 200], ['1.5 Ltr', 250]], 200)]);

db.transaction(() => {
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM categories').run();
  const insCat = db.prepare('INSERT INTO categories (id, name, icon, "order") VALUES (?, ?, ?, ?)');
  categories.forEach(c => insCat.run(c.id, c.name, c.icon, c.order));
  const insProd = db.prepare(`INSERT INTO products (id, name, categoryId, categoryName, price_paisa, cost_price_paisa, stockQuantity, minStockThreshold, image, description, isAvailable, isDeal, bundledProducts, variations, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, 999, 0, '', ?, 1, ?, '[]', ?, ?, ?)`);
  products.forEach(p => insProd.run(p.id, p.name, p.categoryId, catName[p.categoryId], rs(p.price), p.description, p.isDeal ? 1 : 0, JSON.stringify(p.variations), now, now));
})();

console.log(`Imported ${categories.length} categories and ${products.length} products.`);
