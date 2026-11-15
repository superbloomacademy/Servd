'use client';
// Placeholder artwork for items without a photo: a soft tile with an icon chosen from the item/category name.
import {
  Popcorn, CupSoda, Coffee, Sandwich, Pizza, IceCream, Salad, Soup, Cookie, Beer, Drumstick, UtensilsCrossed, Croissant, Cake, GlassWater, Flame, Wheat, Milk,
} from 'lucide-react';

const RULES: [RegExp, React.ComponentType<{ size?: number; strokeWidth?: number }>, string][] = [
  [/popcorn/i, Popcorn, '#FFF4D6'], [/cola|soda|lime|drink|beverage/i, CupSoda, '#E6F4FF'], [/coffee|cappuccino|latte|americano|brew|chai|tea/i, Coffee, '#F5ECE3'],
  [/water/i, GlassWater, '#E8F6FA'], [/lassi|shake|smoothie|chaas|milk/i, Milk, '#F2F0FF'], [/sandwich|burger|wrap|roll|pav|club/i, Sandwich, '#FFF1E6'],
  [/pizza|garlic bread/i, Pizza, '#FFEDE6'], [/brownie|cheesecake|cake|meetha|jamun|dessert/i, Cake, '#FDEBF3'], [/ice ?cream/i, IceCream, '#FDEBF3'],
  [/chicken|nugget|tandoori|65/i, Drumstick, '#FFEDE6'], [/biryani|rice|dal|paneer|kadai|butter chicken|main/i, Soup, '#FFF3E0'],
  [/naan|roti|bread/i, Wheat, '#FAF3E3'], [/puff|samosa|croissant/i, Croissant, '#FFF4D6'], [/fries|corn|nachos|chaat|puri|bhel|papdi|snack|starter/i, Flame, '#FFF0EA'],
  [/salad/i, Salad, '#EAF7EE'], [/cookie/i, Cookie, '#F5ECE3'], [/beer/i, Beer, '#FFF6D9'],
];

export function FoodArt({ name, category, imageUrl, size = 112, className = '' }: { name: string; category?: string; imageUrl?: string | null; size?: number; className?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={`rounded-2xl object-cover ${className}`} style={{ width: size, height: size }} loading="lazy" />;
  }
  const rule = RULES.find(([re]) => re.test(name)) || RULES.find(([re]) => re.test(category || ''));
  const Icon = rule?.[1] || UtensilsCrossed;
  return (
    <div className={`grid place-items-center rounded-2xl ${className}`} style={{ width: size, height: size, background: rule?.[2] || '#F4F5F7' }} aria-hidden>
      <span className="text-ink-2/70"><Icon size={Math.round(size * 0.38)} strokeWidth={1.5} /></span>
    </div>
  );
}
