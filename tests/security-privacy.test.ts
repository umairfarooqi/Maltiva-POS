import 'fake-indexeddb/auto';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { MaintenanceApi } from '../src/services/maintenanceApi';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { INITIAL_PRODUCTS,INITIAL_CATEGORIES,INITIAL_USERS,INITIAL_PRINTER_SETTINGS } from '../src/data/initialData';
import { checkoutData, hasPrivateFields } from '../src/services/clientPrivacy';
import { captureSession, sessionFetch } from '../src/services/session';
import { normalizeProduct } from '../src/utils/normalizeProduct';
import { saleFixture } from './helpers/sale-fixtures';
beforeEach(async()=>{localStorage.clear();await new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase('maltiva-pos-pending-sales');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('blocked fixture database'));});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
const cashier=()=>{PosStorage.setToken('new-cashier');PosStorage.setSession(INITIAL_USERS[1]);};
const full={historyIncluded:true,products:[{...normalizeProduct(INITIAL_PRODUCTS[0]),costPricePaisa:0}],categories:INITIAL_CATEGORIES,users:[],orders:[],inventoryLogs:[],printerSettings:INITIAL_PRINTER_SETTINGS};
it('keeps acknowledgments readable without admin costs after clearing replaceable cache',async()=>{
 const order={...saleFixture('ack-private'),persistenceState:'saved' as const,synced:true};
 await PendingOutbox.acknowledge(order);localStorage.clear();cashier();
 const recovered=await PosApi.loadRecoveryOrders();expect(recovered[0].totalCostPaisa).toBeUndefined();expect(recovered[0].items[0].unitCostPaisa).toBeUndefined();expect(await PendingOutbox.acknowledged()).toHaveLength(1);
});
it('keeps rejected recovery and its identity without private costs',async()=>{
 await PendingOutbox.reject(saleFixture('rejected-private'),'Fixture rejected');localStorage.clear();cashier();
 const recovered=await PosApi.loadRecoveryOrders();expect(recovered[0].persistenceState).toBe('rejected');expect(recovered[0].totalCostPaisa).toBeUndefined();
});
it('keeps online cashier recovery cost-free while preserving an admin pending identity',async()=>{
 const order=await PendingOutbox.put(saleFixture('pending-private'));localStorage.clear();cashier();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(full))));
 const data=await PosApi.fetchInitialData();expect(data.isOnline).toBe(true);expect(data.users).toEqual([]);expect(data.orders[0].idempotencyKey).toBe(order.idempotencyKey);expect(data.orders[0].totalCostPaisa).toBeUndefined();
});
it('rejects a delayed stock body after a session switch before changing cache',async()=>{
 PosStorage.setToken('old-admin');const product=normalizeProduct(INITIAL_PRODUCTS[0]);let resume!:(x:any)=>void;
 const response=new Response('{}');const json=vi.spyOn(response,'json').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const pending=PosApi.adjustStock(product.id,1,'Fixture restock','restock',INITIAL_USERS[0],true);await vi.waitFor(()=>expect(json).toHaveBeenCalled());
 const rejected=expect(pending).rejects.toMatchObject({name:'SessionChangedError'});
 localStorage.clear();cashier();PosStorage.setProducts([{...product,costPricePaisa:0}]);const cache={...localStorage};resume({product,log:{id:'fixture-log',productId:product.id,changeAmount:1,userId:INITIAL_USERS[0].id}});await rejected;
 expect({...localStorage}).toEqual(cache);expect(PosStorage.getInventoryLogs()).toHaveLength(0);expect(PosStorage.getToken()).toBe('new-cashier');
});
it('retains a late 201 acknowledgment and original key without private cache data',async()=>{
 PosStorage.setToken('old-admin');const order=saleFixture('late-saved-private');let resume!:(x:any)=>void;
 const response=new Response('{}',{status:201});const json=vi.spyOn(response,'json').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const pending=PosApi.placeOrder(order,true);await vi.waitFor(()=>expect(json).toHaveBeenCalled());localStorage.clear();cashier();resume({order:{...order,orderNumber:'#SAVED-FIXTURE',tokenNumber:9}});
 const result=await pending;expect(result.state).toBe('saved');expect(await PendingOutbox.list()).toHaveLength(0);expect(PosStorage.getOrders()[0].totalCostPaisa).toBeUndefined();expect(PosStorage.getToken()).toBe('new-cashier');
});
it('CONTROL: cashier-shaped online server rows replace matching old saved cost snapshots',async()=>{
 const order={...saleFixture('matching-private'),persistenceState:'saved' as const};PosStorage.setOrders([order]);cashier();
 const {totalCostPaisa,profitPaisa,profitMarginPercent,...safeOrder}=order;
 safeOrder.items=order.items.map(({unitCostPaisa,totalCostPaisa,...item})=>item as any);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...full,orders:[safeOrder]}))));
 const data=await PosApi.fetchInitialData();expect(data.orders[0].totalCostPaisa).toBeUndefined();
});

it('blocks an old admin backup download after switching to cashier during blob decoding',async()=>{
 PosStorage.setToken('old-admin');let resume!:(blob:Blob)=>void;
 const response=new Response('synthetic backup fixture');const blob=vi.spyOn(response,'blob').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const OriginalURL=URL;vi.stubGlobal('URL',class extends OriginalURL {static createObjectURL(){return 'blob:fixture-only-backup';}static revokeObjectURL(){}});
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const pending=MaintenanceApi.download('fixture-only-backup.db');await vi.waitFor(()=>expect(blob).toHaveBeenCalled());
 const rejected=expect(pending).rejects.toMatchObject({name:'SessionChangedError'});
 localStorage.clear();cashier();resume(new Blob(['synthetic backup fixture']));await rejected;
 expect(click).not.toHaveBeenCalled();expect(PosStorage.getToken()).toBe('new-cashier');
});

async function rawRows(write?: any): Promise<any[]> {
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open('maltiva-pos-pending-sales',1);r.onupgradeneeded=()=>r.result.createObjectStore('orders',{keyPath:'idempotencyKey'});
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('orders',write?'readwrite':'readonly'),store=tx.objectStore('orders');if(write)store.put(write);const read=store.getAll();tx.oncomplete=()=>{db.close();resolve(read.result)};tx.onabort=()=>{db.close();reject(tx.error)}};
 });
}
it('migrates existing private IndexedDB copies in place without changing receipt/recovery fields',async()=>{
 for(const state of ['pending','rejected','saved'] as const) {
  const order={...saleFixture('legacy-private-'+state),persistenceState:state,rejectionReason:state==='rejected'?'Review this sale':undefined};await rawRows(order);
 }
 cashier();const recovered=await PosApi.loadRecoveryOrders();expect(recovered).toHaveLength(3);
 for(const row of await rawRows()) {
  expect(hasPrivateFields(row)).toBe(false);expect(row.idempotencyKey).toBe('key-legacy-private-'+row.persistenceState);
  expect(row).toMatchObject({totalPaisa:99000,cashTenderedPaisa:100000,changeDuePaisa:1000});expect(row.items[0]).toMatchObject({quantity:1,notes:'No onion',unitPricePaisa:99000});
 }
});
it('leaves the original durable private row intact and blocks the read if privacy migration fails',async()=>{
 const order={...saleFixture('migration-failure'),persistenceState:'pending'};await rawRows(order);
 const put=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw Error('Cannot replace recovery row')});
 await expect(PosApi.loadRecoveryOrders()).rejects.toThrow('Cannot replace recovery row');put.mockRestore();
 expect((await rawRows())[0].idempotencyKey).toBe(order.idempotencyKey);expect((await rawRows())[0].totalCostPaisa).toBe(55000);
 expect(hasPrivateFields((await PosApi.loadRecoveryOrders())[0])).toBe(false);
});
it('never downgrades a durable saved acknowledgment when migrating an older legacy pending copy',async()=>{
 const order=saleFixture('legacy-ack-race');await PendingOutbox.acknowledge({...order,persistenceState:'saved',orderNumber:'#CANONICAL',tokenNumber:7});
 PosStorage.setOfflineQueue([{...order,persistenceState:'pending'}]);expect(await PendingOutbox.list()).toEqual([]);
 expect(await PendingOutbox.acknowledged()).toMatchObject([{idempotencyKey:order.idempotencyKey,orderNumber:'#CANONICAL',tokenNumber:7,persistenceState:'saved'}]);
});
it('cleans old browser caches and nested drafts without deleting the submitted attempt',()=>{
 const product=normalizeProduct(INITIAL_PRODUCTS[0]),order=saleFixture('private-draft');
 const cart=[{cartItemId:'line-kept',product,quantity:1,unitPricePaisa:99000,unitCostPaisa:55000,totalPricePaisa:99000,totalCostPaisa:55000,notes:'keep notes',selectedVariations:[]}];
 localStorage.setItem('tasty_pos_checkout_draft',JSON.stringify({cart,paymentMethod:'cash',attempt:order}));localStorage.setItem('tasty_pos_users',JSON.stringify(INITIAL_USERS));localStorage.setItem('tasty_pos_logs','[{"id":"old-log"}]');localStorage.setItem('tasty_pos_products',JSON.stringify([product]));localStorage.setItem('tasty_pos_orders',JSON.stringify([order]));
 PosStorage.sanitizeBrowserData();for(const key of ['tasty_pos_checkout_draft','tasty_pos_products','tasty_pos_orders'])expect(hasPrivateFields(JSON.parse(localStorage.getItem(key)!))).toBe(false);
 expect(PosStorage.getUsers()).toEqual([]);expect(PosStorage.getInventoryLogs()).toEqual([]);const draft=PosStorage.getDraft();expect(draft?.attempt?.idempotencyKey).toBe(order.idempotencyKey);expect(draft?.cart[0]).toMatchObject({cartItemId:'line-kept',notes:'keep notes',unitPricePaisa:99000,unitCostPaisa:0});
});
it('retains full authorized report data only in current-session memory while persisting safe checkout data',()=>{
 PosStorage.setToken('admin');const order={...saleFixture('report-memory'),persistenceState:'saved' as const};PosStorage.setOrders([order]);PosStorage.setProducts([normalizeProduct(INITIAL_PRODUCTS[0])]);PosStorage.setUsers(INITIAL_USERS);
 expect(PosStorage.getOrders()[0].totalCostPaisa).toBe(55000);expect(PosStorage.getProducts()[0].costPricePaisa).toBeGreaterThan(0);
 expect(hasPrivateFields(JSON.parse(localStorage.getItem('tasty_pos_orders')!))).toBe(false);PosStorage.clearSession();cashier();
 expect(PosStorage.getOrders()[0].totalCostPaisa).toBeUndefined();expect(PosStorage.getProducts()[0].costPricePaisa).toBeUndefined();expect(PosStorage.getUsers()).toEqual([]);
});
it('invalidates ownership even when the same token string is removed and re-established',()=>{
 PosStorage.setToken('same-token');const guard=captureSession();PosStorage.clearSession();PosStorage.setToken('same-token');expect(guard.isCurrent()).toBe(false);
});
it.each(['json','blob','text','arrayBuffer'] as const)('guards delayed %s body delivery and cloned responses',async method=>{
 PosStorage.setToken('old');let resume!:(value:any)=>void;
 const response=new Response('{}');const read=vi.spyOn(response,method).mockReturnValue(new Promise(done=>resume=done) as any);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const owned=await sessionFetch('/api/private',{headers:{Authorization:'Bearer old'}});const body=owned[method]();const rejected=expect(body).rejects.toMatchObject({name:'SessionChangedError'});expect(read).toHaveBeenCalledOnce();cashier();resume(method==='json'?{}:new Blob(['fixture']));await rejected;
});
it('also guards a cloned JSON response after switching sessions',async()=>{
 PosStorage.setToken('old');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"private":true}')));const response=await sessionFetch('/api/private',{headers:{Authorization:'Bearer old'}});const clone=response.clone();cashier();await expect(clone.json()).rejects.toMatchObject({name:'SessionChangedError'});
});
it('does not return or cache a delayed administrator product save after switching accounts',async()=>{
 PosStorage.setToken('admin');let resume!:(value:any)=>void;const product=normalizeProduct(INITIAL_PRODUCTS[0]);const response=new Response('{}');const json=vi.spyOn(response,'json').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const pending=PosApi.updateProduct(product,true);const rejected=expect(pending).rejects.toMatchObject({name:'SessionChangedError'});await vi.waitFor(()=>expect(json).toHaveBeenCalled());cashier();const cache={...localStorage};resume(product);await rejected;expect({...localStorage}).toEqual(cache);
});

it('suppresses an old session transport error instead of delivering its message to the new operator',async()=>{
 PosStorage.setToken('old');let fail!:(error:Error)=>void;vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise((_,reject)=>fail=reject)));
 const request=sessionFetch('/api/private',{headers:{Authorization:'Bearer old'}});const rejected=expect(request).rejects.toMatchObject({name:'SessionChangedError',message:'The active session changed.'});cashier();fail(Error('private old-session detail'));await rejected;
});
it('suppresses an old body-decoding error after a session change',async()=>{
 PosStorage.setToken('old');let fail!:(error:Error)=>void;const response=new Response('{}');vi.spyOn(response,'json').mockReturnValue(new Promise((_,reject)=>fail=reject));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const guarded=await sessionFetch('/api/private',{headers:{Authorization:'Bearer old'}});const body=guarded.json();const rejected=expect(body).rejects.toMatchObject({name:'SessionChangedError',message:'The active session changed.'});cashier();fail(Error('private invalid JSON fragment'));await rejected;
});
it('retains a safe late acknowledgment in IndexedDB when its optional cache is full',async()=>{
 PosStorage.setToken('old');const order=saleFixture('late-quota');let resume!:(body:any)=>void;const response=new Response('{}',{status:201});const json=vi.spyOn(response,'json').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const saved=PosApi.placeOrder(order,true);await vi.waitFor(()=>expect(json).toHaveBeenCalled());cashier();vi.spyOn(PosStorage,'setOrders').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError')});resume({order:{...order,orderNumber:'#LATE-QUOTA',tokenNumber:42}});
 expect((await saved).state).toBe('saved');expect(await PendingOutbox.list()).toHaveLength(0);expect(await PendingOutbox.acknowledged()).toMatchObject([{idempotencyKey:order.idempotencyKey,orderNumber:'#LATE-QUOTA',tokenNumber:42}]);expect(hasPrivateFields(await rawRows())).toBe(false);
});
it('quarantines an old-database late acknowledgment without repopulating restored receipt cache',async()=>{
 PosStorage.observeDatabaseGeneration('generation-before',false);PosStorage.setToken('old');const order={...saleFixture('late-restore'),databaseGeneration:'generation-before'};let resume!:(body:any)=>void;const response=new Response('{}',{status:201});const json=vi.spyOn(response,'json').mockReturnValue(new Promise(done=>resume=done));vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
 const saved=PosApi.placeOrder(order,true);await vi.waitFor(()=>expect(json).toHaveBeenCalled());PosStorage.observeDatabaseGeneration('generation-after',true);cashier();resume({order:{...order,orderNumber:'#OLD-DATABASE',tokenNumber:3}});
 expect((await saved).state).toBe('saved');expect(PosStorage.getOrders()).toEqual([]);expect(await PendingOutbox.list()).toEqual([]);expect(await PosApi.loadRecoveryOrders()).toEqual([]);expect(await PendingOutbox.acknowledged()).toMatchObject([{idempotencyKey:order.idempotencyKey,databaseGeneration:'generation-before'}]);
});

it('returns a safe saved result when the session changes while recovery removal is committing',async()=>{
 PosStorage.setToken('old');const order=saleFixture('late-remove');const remove=PendingOutbox.remove.bind(PendingOutbox);let release!:()=>void;
 const removing=vi.spyOn(PendingOutbox,'remove').mockImplementation(key=>new Promise<void>((resolve,reject)=>{release=()=>{remove(key).then(resolve,reject)}}));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({order}),{status:201})));
 const sale=PosApi.placeOrder(order,true);await vi.waitFor(()=>expect(removing).toHaveBeenCalled());cashier();release();const result=await sale;
 expect(result.state).toBe('saved');expect(result.order.idempotencyKey).toBe(order.idempotencyKey);expect(hasPrivateFields(result.order)).toBe(false);expect(await PendingOutbox.list()).toEqual([]);
});
