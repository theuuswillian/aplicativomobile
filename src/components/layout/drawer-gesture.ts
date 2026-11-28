/** Largura da faixa da borda esquerda que inicia o gesto de abrir a gaveta. */
export const DRAWER_EDGE_PX = 24;
/** Velocidade (px/ms) que, sozinha, decide o encaixe — um "flick". */
export const DRAWER_FLICK_VELOCITY = 0.45;

/**
 * Decide se a gaveta termina aberta ou fechada ao soltar o dedo:
 * um flick rápido vence; senão vale a distância (mais de 40% da largura).
 */
export function decideDrawerSnap({ fromOpen, dx, velocity, width }: { fromOpen: boolean; dx: number; velocity: number; width: number }): boolean {
  if (velocity >= DRAWER_FLICK_VELOCITY) return true;
  if (velocity <= -DRAWER_FLICK_VELOCITY) return false;
  const threshold = Math.max(1, width) * 0.4;
  return fromOpen ? dx > -threshold : dx > threshold;
}
