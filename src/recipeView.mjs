const text=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
export function recipeView(recipes,{filter='all',maxMinutes=0,query='',translate=x=>x}={}){
 const q=text(query);
 return recipes.filter(r=>(filter==='all'||filter==='ready'&&r.missing.length===0||filter==='one'&&r.missing.length===1||filter==='urgent'&&r.urgent.length>0)&&(!maxMinutes||r.minutes<=maxMinutes)&&(!q||[r.title,translate(r.title),...r.ingredients,...r.ingredients.map(x=>translate(x))].some(x=>text(x).includes(q))));
}

export const recipeInventory=records=>records.filter(r=>!r.deleted&&!r.conflict).map(r=>r.data);
