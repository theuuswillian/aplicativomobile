// Categorias padrão criadas (de forma idempotente) para cada conta e o ícone sugerido por nome.

export const DEFAULT_CATEGORIES: Array<{name:string;icon:string;kind:"income"|"expense";color:string;is_default:boolean}> = [
 ...[["Mercado","🛒"],["Alimentação","🍽️"],["Restaurantes","🍔"],["Delivery","🛵"],["Transporte","🚗"],["Combustível","⛽"],["Moradia","🏠"],["Aluguel","🏡"],["Condomínio","🏢"],["Água","💧"],["Energia","💡"],["Internet e telefone","📱"],["Saúde","🩺"],["Farmácia","💊"],["Educação","📚"],["Pets","🐾"],["Lazer","🎟️"],["Assinaturas","📺"],["Roupas","👕"],["Beleza","💇"],["Viagem","✈️"],["Impostos","🧾"],["Seguros","🛡️"],["Presentes","🎁"],["Casa","🛋️"],["Manutenção","🧰"],["Outros","📦"]].map(([name,icon])=>({name,icon,kind:"expense" as const,color:"#64748b",is_default:true})),
 ...[["Salário","💼"],["Freelance","🧑‍💻"],["Rendimentos","📈"],["Dividendos","💹"],["Aluguel recebido","🏠"],["Reembolso","↩️"],["Vendas","🛍️"],["Outras receitas","💰"]].map(([name,icon])=>({name,icon,kind:"income" as const,color:"#16a34a",is_default:true}))
];
export function categoryIcon(name:string):string {
 const n=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const rules:Array<[RegExp,string]>=[[/mercad|supermerc|hortifruti|feira/,"🛒"],[/aluguel|moradia|casa|condominio/,"🏠"],[/restaur|aliment|comida|delivery/,"🍽️"],[/transporte|uber|taxi|onibus|metro/,"🚗"],[/combust|gasolina|posto/,"⛽"],[/agua/,"💧"],[/energia|luz|eletric/,"💡"],[/internet|telefone|celular/,"📱"],[/saude|medic/,"🩺"],[/farmac|drogaria/,"💊"],[/educa|curso|livro|escola/,"📚"],[/pet|animal|veterin/,"🐾"],[/viagem/,"✈️"],[/lazer|cinema|show/,"🎟️"],[/assinatura|stream/,"📺"],[/roupa|calcad/,"👕"],[/salario|emprego/,"💼"],[/freelance|servico/,"🧑‍💻"],[/dividend|rendimento|invest/,"📈"],[/presente/,"🎁"],[/imposto|taxa/,"🧾"],[/seguro/,"🛡️"]];
 return rules.find(([pattern])=>pattern.test(n))?.[1]??"📦";
}
