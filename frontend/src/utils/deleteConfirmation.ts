export function requestDeletePassword(resourceDescription: string): string | null {
  const password = window.prompt(`Digite sua senha para excluir ${resourceDescription}. Esta ação será registrada na auditoria.`);
  if (password === null) return null;
  if (!password.trim()) {
    window.alert('A senha é obrigatória para excluir.');
    return null;
  }
  return password;
}
