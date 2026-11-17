import { it, expect } from "vitest";
import { financialAlerts } from "../src/domain/alerts";
import { emptyState, type Entry } from "../src/domain/finance";
it("avisos pessoais e Casa preservam o contexto e não chamam pagamento de consumo",()=>{
 const s=emptyState();const entry=(id:string,amount:number,on:string,house=false,consumer='a'):Entry=>({id,owner_id:consumer,family_id:'f',description:'Lazer',kind:'expense',amount,occurred_on:on,category:'Lazer',house,consumer_id:consumer,responsible_id:null,card_id:'card',splits:[],version:1,voided:false});
 s.entries=[entry('1',10000,'2026-08-05'),entry('2',10000,'2026-09-05'),entry('3',10000,'2026-10-05'),entry('4',20000,'2026-11-05'),entry('5',900000,'2026-11-05',true),entry('6',900000,'2026-11-05',false,'b')];
 s.personal_budgets=[{owner_id:'a',month:'2026-11',category:'Lazer',amount:20000,warning:80,version:1}];
 const personal=financialAlerts(s,'a',false,'2026-11-16');expect(personal.unusual).toEqual(['Lazer']);expect(personal.budgets[0].summary.actual).toBe(20000);expect(financialAlerts(s,'a',true,'2026-11-16').budgets).toEqual([]);
});
