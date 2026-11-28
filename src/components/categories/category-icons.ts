// Ícones de categoria: nome salvo no banco (coluna icon) → componente do lucide-react.
// Importações nomeadas para manter o tree-shaking do bundle.
import { suggestCategoryIcon, type CategoryKind } from "../../data/default-categories";
import { Award, Baby, Banknote, Bike, BookOpen, Briefcase, Building, Building2, Bus, CalendarCheck, CarTaxiFront, ChartLine, CircleDollarSign, CircleParking, Clock, Code, Croissant, Droplet, Dumbbell, Fuel, Gift, GraduationCap, HandHeart, HeartPulse, House, KeyRound, Landmark, Laptop, Milestone, Package, PartyPopper, PawPrint, Percent, Pill, Plane, Presentation, Repeat, Shield, ShieldPlus, Shirt, ShoppingCart, Smartphone, Sofa, Sparkles, Store, Tag, TreePalm, TrendingUp, Tv, Undo2, Utensils, Wifi, Wrench, Zap, type LucideIcon } from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = { Award, Baby, Banknote, Bike, BookOpen, Briefcase, Building, Building2, Bus, CalendarCheck, CarTaxiFront, ChartLine, CircleDollarSign, CircleParking, Clock, Code, Croissant, Droplet, Dumbbell, Fuel, Gift, GraduationCap, HandHeart, HeartPulse, House, KeyRound, Landmark, Laptop, Milestone, Package, PartyPopper, PawPrint, Percent, Pill, Plane, Presentation, Repeat, Shield, ShieldPlus, Shirt, ShoppingCart, Smartphone, Sofa, Sparkles, Store, Tag, TreePalm, TrendingUp, Tv, Undo2, Utensils, Wifi, Wrench, Zap };

export function isKnownCategoryIcon(icon: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, icon);
}

export type CategoryLike = { name: string; kind: CategoryKind; icon: string | null; color: string | null };

/** Resolve ícone e cor de uma categoria: ícone lucide salvo; emoji legado ou vazio vira a sugestão pelo nome. */
export function resolveCategoryVisual(category: CategoryLike): { Icon: LucideIcon; color: string } {
  const suggestion = suggestCategoryIcon(category.name, category.kind);
  const color = category.color && /^#[0-9a-f]{6}$/i.test(category.color) && category.color.toLowerCase() !== "#64748b" ? category.color : suggestion.color;
  const Icon = (category.icon && isKnownCategoryIcon(category.icon) ? CATEGORY_ICONS[category.icon] : CATEGORY_ICONS[suggestion.icon]) ?? CATEGORY_ICONS.Tag;
  return { Icon, color };
}
