// Mensagens de erro exibidas ao usuário.

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error &&
      typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Não foi possível concluir a operação.";
}

/** Traduz as mensagens mais comuns do Supabase Auth para português. */
export function authErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos. Confira os dados ou use “Esqueci minha senha”.";
  if (normalized.includes("email not confirmed")) return "Seu e-mail ainda não foi confirmado. Abra o link enviado para sua caixa de entrada.";
  if (normalized.includes("user already registered")) return "Já existe uma conta com este e-mail. Entre ou recupere sua senha.";
  if (normalized.includes("password should be at least")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  if (normalized.includes("failed to fetch") || normalized.includes("network")) return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  return message;
}
