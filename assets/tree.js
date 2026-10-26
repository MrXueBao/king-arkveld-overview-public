/* Lite 的折叠树、分区和局部导航；公开侧只显示静态选招信息。 */
(async function () {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const info = (host, text, cls = 'note') => host.append(el('p', cls, text));
const btn = (text, fn, cls = 'mini') => {
  const b = el('button', cls, text); b.type = 'button';
  b.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
  return b;
};
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
// 长计算中按耗时让出主线程；MessageChannel 不受嵌套 setTimeout 的 4 ms 下限影响。
const yieldChannel = new MessageChannel(), yieldQueue = [];
yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
let sliceStart = performance.now();
const slice = () => {
  if (performance.now() - sliceStart < 12) return null;
  return new Promise(resolve => { yieldQueue.push(() => { sliceStart = performance.now(); resolve(); }); yieldChannel.port2.postMessage(0); });
};
const [response, catalogResponse] = await Promise.all([
  fetch('./data/decision-tree.json.gz'), fetch('./data/actions.json')
]);
if (!response.ok || !catalogResponse.ok) throw Error('无法读取查询数据');
const D = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
const catalog = await catalogResponse.json();
const media = new Map(catalog.actions.map(a => [a.id, a]));
const N = D.graph.nodes, E = Object.fromEntries(D.graph.edges.map(e => [e.id, e])), R = D.graph.requests;
const S = DecisionSemantic, F = DecisionFlow.create(D.graph, D.model), P = S.create(F);
const paths = new Map(), matchCache = new Map(), profileCache = new Map(), statusCache = new Map();
// prefixCache 依赖当前状态；maskCache 只依赖链本身（四种 Mode/Charge 组合），状态切换后仍可复用。
const prefixCache = new Map(), maskCache = new Map();
// 尾段结果按（阶段重置后的保留字段签名, 尾段路径与偏移）索引；签名已包含全部影响判断的值，状态切换后仍有效。
const deltaCache = new Map(), conflictCache = new Map(), maskTails = new Map(), maskMemo = new Map();
const pending = new Map(), bundles = new Map(), expanded = new Set(['root', 'root/ordinary']), history = [];
const timers = new Map(D.model.timers.map(t => [t.id, t]));
let state = readState(), view = {type: 'home'}, serial = 0, nextBundle = 0, nextRoute = 0, showAll = false;
const actionName = id => D.actions[id]?.name || '其他动作';
const actionCode = id => media.get(id)?.code || '';
const requestAction = r => R[r.site]?.actionId;
function readState() {
  const s = {...S.scope};
  for (const k of ['hp', 'mode', 'distance', 'chain']) if ($(k).value !== '') s[k] = Number($(k).value);
  for (const k of ['charge', 'angry']) if ($(k).value !== '') s[k] = $(k).value === 'true';
  return s;
}
function path(id) {
  if (paths.has(id)) return paths.get(id);
  const trace = []; let p = D.paths[id];
  while (p) { const t = D.trace_trie[p]; trace.push([t[1], t[2]]); p = t[0]; }
  trace.reverse(); paths.set(id, trace); return trace;
}
function addPath(trace) { const id = D.paths.length; D.paths.push(0); paths.set(id, trace); return id; }
function match(id) {
  if (!matchCache.has(id)) matchCache.set(id, S.matches(path(id), N, E, state));
  return matchCache.get(id);
}
function profile(id) {
  if (profileCache.has(id)) return profileCache.get(id);
  let ok = true;
  for (const [eid] of path(id)) {
    const e = E[eid], n = N[e?.source];
    if (!e?.type.startsWith('predicate_') || !n?.profile) continue;
    const value = F.evaluate(n.arg, state, n.id);
    if (value !== null && value !== (e.type === 'predicate_true')) { ok = false; break; }
  }
  profileCache.set(id, ok); return ok;
}
const displayMatch = id => match(id).ok && ($('conservative').checked || profile(id));

// 每条具体入口各自重放；合并动作卡不会将不同父入口拼成一条执行链。
function stages(ids, tail = null) {
  const result = []; let maxEpoch = -1;
  for (const [index, id] of ids.entries()) {
    const segment = path(D.routes[id].path); if (!segment.length) continue;
    const min = Math.min(...segment.map(x => x[1]));
    const offset = index === 0 ? 0 : Math.max(0, maxEpoch + 1 - min);
    for (const [edge, epoch] of segment) { const e = epoch + offset; result.push([edge, e]); maxEpoch = Math.max(maxEpoch, e); }
  }
  if (tail !== null) {
    const segment = path(tail);
    if (segment.length) {
      const offset = Math.max(0, maxEpoch + 1 - Math.min(...segment.map(x => x[1])));
      for (const [edge, epoch] of segment) result.push([edge, epoch + offset]);
    }
  }
  return result;
}
// 同一入口链下的全部候选共享这条链的重放前缀；尾段按 stages() 的同一偏移接上，结果与整条重放一致。
function prefix(chain) {
  const key = chain.join(',');
  if (prefixCache.has(key)) return prefixCache.get(key);
  const combined = stages(chain);
  let maxEpoch = -1; for (const [, epoch] of combined) maxEpoch = Math.max(maxEpoch, epoch);
  if (!maskCache.has(key)) { const m = S.maskStart(combined, N, E); maskCache.set(key, {m, entries: S.maskEntries(m)}); }
  const run = S.replayStep(S.replayStart(state), combined, N, E);
  // 前缀非空时尾段首条边必然进入新时间阶段；只有这时才能按重置后的签名共享尾段结果。
  const value = {run, mask: maskCache.get(key), maxEpoch, entry: combined.length ? S.tailEntry(run) : null};
  prefixCache.set(key, value); return value;
}
function status(r, context, chain = []) {
  const key = r.id + '|' + context + '|' + chain.join(',');
  if (statusCache.has(key)) return statusCache.get(key);
  const entry = D.routes[chain[0]], p = prefix(chain), segment = path(r.path);
  let tail = segment, offset = 0;
  if (segment.length) {
    let min = Infinity; for (const [, epoch] of segment) min = Math.min(min, epoch);
    offset = Math.max(0, p.maxEpoch + 1 - min);
    if (offset) tail = segment.map(([edge, epoch]) => [edge, epoch + offset]);
  }
  const inherited = entry?.kind === 'continuation' ? D.retained_state_inheritance.contexts[entry.source_context] : 15;
  let run, mask;
  if (p.entry) {
    // 尾段增量只取决于（重置后签名, 尾段）；有冲突时冲突说明引用前缀 witness，改按含 witness 的完整入口签名共享。
    const tailKey = r.path + '@' + offset, dk = p.entry.sig + '|' + tailKey;
    let delta = deltaCache.get(dk);
    if (delta === undefined) { delta = S.tailDelta(p.entry, tail, N, E); deltaCache.set(dk, delta.conflict ? null : delta); if (delta.conflict) conflictCache.set(p.entry.full + '|' + tailKey, delta); }
    if (delta === null) {
      const ck = p.entry.full + '|' + tailKey;
      delta = conflictCache.get(ck);
      if (delta === undefined) { delta = S.tailDelta(p.entry, tail, N, E); conflictCache.set(ck, delta); }
    }
    run = S.joinDelta(p.run, delta);
    if (!maskTails.has(tailKey)) maskTails.set(tailKey, S.maskEdges(tail, N, E));
    mask = S.maskJoin(p.mask.entries, maskTails.get(tailKey), tailKey, N, E, maskMemo);
  } else {
    run = S.replayResult(S.replayStep(S.replayFork(p.run), tail, N, E));
    mask = S.maskFinish(p.mask.m, tail, N, E);
  }
  const value = S.chainRequirements(D, entry?.kind === 'continuation' ? entry.source_context : context, run, mask, state, inherited || 15);
  statusCache.set(key, value); return value;
}
function groupRecords(records) {
  const groups = new Map();
  for (const item of records) {
    const id = requestAction(D.routes[item.rid]); if (!id || !D.actions[id]) continue;
    if (!groups.has(id)) groups.set(id, {id, records: []});
    groups.get(id).records.push(item);
  }
  // 保持输入的控制流顺序，优先流程不能按译名排序。
  return [...groups.values()];
}
function firstRecords(ids) {
  return ids.filter(id => displayMatch(D.routes[id].path)).map(id => ({rid: id, chain: [id]}));
}
function grouped(ids, context, chain = []) {
  return groupRecords(ids.filter(id => !status(D.routes[id], context, chain).incompatible.length)
    .map(id => ({rid: id, chain: [...chain, id]})));
}
function branch(host, level, key, type, title, subtitle, loader, open = false) {
  const d = el('details', 'branch ' + type), summary = el('summary'), label = el('span', 'grow');
  d.dataset.level = level; d.dataset.key = key;
  label.append(el('span', 'title', title));
  if (subtitle) label.append(el('span', 'subtitle', subtitle));
  summary.append(label); d.append(summary);
  let loaded = false;
  const load = () => {
    if (loaded) return; loaded = true;
    const body = el('div', 'children'); d.append(body);
    Promise.resolve(loader?.(body)).catch(error => { info(body, '暂时无法展开，请刷新后重试。'); console.error(error); });
  };
  d.addEventListener('toggle', () => { if (d.open) { expanded.add(key); load(); } else expanded.delete(key); });
  host.append(d);
  if (open || expanded.has(key)) { d.open = true; load(); }
  return d;
}
function details(host, title, loader) {
  const d = el('details', 'evidence-inline'), summary = el('summary', '', title); d.append(summary);
  let loaded = false;
  d.addEventListener('toggle', () => { if (d.open && !loaded) { loaded = true; const body = el('div'); d.append(body); loader(body); } });
  host.append(d); return d;
}
function showPanel(title, loader) {
  $('panel-title').textContent = title; $('panel-body').replaceChildren(); loader($('panel-body'));
  $('overlay').classList.add('visible'); $('close').focus();
}
function closePanel() { $('overlay').classList.remove('visible'); }
function guardList(id, afterEntry = false) {
  const trace = path(id); let start = 0;
  if (afterEntry) { const index = trace.findIndex(([eid]) => E[eid]?.type === 'weighted_target'); if (index >= 0) start = index + 1; }
  const list = [];
  for (const [eid, epoch] of trace.slice(start)) {
    const e = E[eid], n = N[e?.source];
    if (!n || !(e.type.startsWith('predicate_') || n.timer_event === 'write')) continue;
    list.push({n, epoch, text: e.type === 'predicate_false' ? n.display_false : n.display});
  }
  return list;
}
function chips(host, list, max = 9) {
  const wrap = el('div', 'chips'), seen = new Set(); let count = 0;
  for (const g of list) {
    const key = g.text + '|' + g.epoch; if (seen.has(key)) continue; seen.add(key);
    if (count++ >= max) continue;
    const chip = g.n.timer ? btn(g.text, () => showTimer(g.n.timer), 'chip timer') : el('span', 'chip', g.text);
    wrap.append(chip);
  }
  host.append(wrap);
  if (seen.size > max) host.append(btn('更多选招条件', () => showPanel('选招条件', box => chips(box, list, Infinity))));
}
function conditionKey(r) { return JSON.stringify(guardList(r.path, r.section === 'pool').map(g => [g.text, g.epoch])); }
function renderConditions(host, records) {
  const alternatives = new Map();
  for (const item of records) { const r = D.routes[item.rid], key = conditionKey(r); if (!alternatives.has(key)) alternatives.set(key, r); }
  if (alternatives.size === 1) { chips(host, guardList(alternatives.values().next().value.path, alternatives.values().next().value.section === 'pool')); return; }
  details(host, '选招条件 · 满足其中一组', box => {
    for (const r of alternatives.values()) { const row = el('div', 'pathline'); chips(row, guardList(r.path, r.section === 'pool'), Infinity); box.append(row); }
  });
}
function showTimer(id) {
  const t = timers.get(id); if (!t) return;
  showPanel(t.name, host => info(host, '配置 ' + t.default));
}
function showTimers() {
  showPanel('Timer 名称', host => {
    const input = el('input'); input.type = 'search'; input.placeholder = '筛选 Timer 中文名'; input.setAttribute('aria-label', '筛选 Timer');
    const list = el('div'); host.append(input, list);
    const draw = () => {
      list.replaceChildren();
      for (const t of timers.values()) if (t.name.includes(input.value.trim())) {
        const row = el('div', 'timer-row'); row.append(el('strong', '', t.name), el('div', 'note', '配置 ' + t.default)); list.append(row);
      }
    };
    input.oninput = draw; draw();
  });
}
function renderMedia(host, id) {
  const m = media.get(id); if (!m?.video) return;
  const box = el('div', 'media'), poster = el('div', 'poster', '动作演示 · 点击后加载');
  if (m.poster) { const image = el('img'); image.src = m.poster; image.alt = actionName(id) + '封面'; image.loading = 'lazy'; poster.replaceChildren(image); }
  box.append(poster);
  const play = btn('播放动作演示', () => {
    if (box.querySelector('video')) return;
    const video = el('video'); video.controls = true; video.playsInline = true; video.muted = true; video.preload = 'none';
    if (m.poster) video.poster = m.poster;
    const source = el('source'); source.src = m.video; source.type = 'video/mp4'; video.append(source);
    poster.replaceWith(video); play.disabled = true; video.load(); video.play().catch(() => {});
  });
  box.append(play); host.append(box);
}

// 一张动作卡携带全部可用入口，展开时对每条入口分别查询，再集合展示下一动作。
function renderAction(host, g, level, key, depth = 1, open = false) {
  const bundleKey = 'selection-' + (++nextBundle); bundles.set(bundleKey, g);
  const d = branch(host, level, key, 'action', actionName(g.id), actionCode(g.id), body => {
    renderConditions(body, g.records); renderMedia(body, g.id);
    body.append(btn('查看该动作的局部后续', () => openLocal(g)));
    if (depth >= 5) {
      const ref = el('div', 'reference');
      ref.append(el('span', '', '继续查看后续动作'), btn('进入局部视图 →', () => openLocal(g))); body.append(ref); return;
    }
    branch(body, level + 1, key + '/resume', 'resume', '假设正常完成后', '', box => renderContinuation(box, g.records, level + 2, key + '/next', depth + 1), true);
  }, open);
  d.dataset.action = g.id; d.dataset.bundle = bundleKey;
  return d;
}
function addLiveAction(hit, context) {
  const id = 'query-route-' + (++nextRoute), cid = 'query-context-' + nextRoute;
  const r = {id, node: hit.node, site: N[hit.node].requestId, path: addPath(hit.trace.map(t => [t.edge, t.epoch])), kind: 'continuation', source_context: context, raw_distance: (D.contexts[context].raw_distance || 0) + hit.depth};
  if (N[hit.node].kind === 'action') {
    r.context = cid; D.contexts[cid] = {id: cid, node: hit.node, site: r.site, stack: hit.stack, stateRow: hit.stateRow, first: false, raw_distance: r.raw_distance};
  }
  D.routes[id] = r; return id;
}
async function ensureContinuation(context) {
  if (D.continuations[context]) return D.continuations[context];
  if (pending.has(context)) return pending.get(context);
  const task = (async () => {
    await pause();
    const result = P.continuation(S.continuationSeed(F, D.contexts[context]), {budget: 12000, maxDepth: 220});
    return D.continuations[context] = {routes: result.hits.map(hit => addLiveAction(hit, context)), incomplete: result.incomplete};
  })();
  pending.set(context, task);
  try { return await task; } finally { pending.delete(context); }
}
async function collectContinuation(records) {
  const next = [], pools = [], seen = new Set(); let incomplete = false;
  for (let i = 0; i < records.length; i++) {
    const item = records[i], r = D.routes[item.rid]; if (!r.context) continue;
    const c = await ensureContinuation(r.context); incomplete ||= c.incomplete;
    for (const rid of c.routes) {
      const candidate = D.routes[rid], key = item.chain.join(',') + '|' + rid;
      if (seen.has(key)) continue; seen.add(key);
      if (status(candidate, r.context, item.chain).incompatible.length) continue;
      if (N[candidate.node].kind === 'action') next.push({rid, chain: [...item.chain, rid]});
      else if (N[candidate.node].pool) pools.push({rid, chain: item.chain});
    }
    const wait = slice(); if (wait) await wait;
  }
  return {groups: groupRecords(next), pools, incomplete};
}
async function renderContinuation(host, records, level, key, depth) {
  const token = serial; info(host, '正在读取后续…', 'loading');
  const result = await collectContinuation(records);
  if (token !== serial || !host.isConnected) return;
  host.replaceChildren();
  for (const g of result.groups) renderAction(host, g, level, key + '/' + g.id, depth);
  if (result.pools.length) {
    const ref = el('div', 'reference');
    ref.append(el('span', '', '后续重新选招'), btn('展开选招池 →', () => openFuturePool(result.pools))); host.append(ref);
  }
  if (result.incomplete) info(host, '后续可能尚有遗漏。');
  if (!result.groups.length && !result.pools.length) info(host, '当前条件下暂无可显示的后续。');
}
function poolStateLabel(root) {
  const list = []; let selectorSeen = false;
  for (const [eid] of path(root.path)) {
    const e = E[eid], n = N[e?.source]; if (n?.selector_gate) selectorSeen = true;
    if (selectorSeen && e?.type.startsWith('predicate_') && n?.profile && (n.display.startsWith('距离 ') || n.arg.selected === 'Status')) list.push(e.type === 'predicate_false' ? n.display_false : n.display);
  }
  return [...new Set(list)].join(' · ') || '其他距离与状态条件';
}
function visiblePools() {
  const groups = new Map();
  for (const root of D.initial) {
    if (!displayMatch(root.path)) continue;
    if (!groups.has(root.selector)) groups.set(root.selector, new Map());
    const pools = groups.get(root.selector); if (!pools.has(root.pool)) pools.set(root.pool, []); pools.get(root.pool).push(root);
  }
  return groups;
}
function renderPriorities(host) {
  branch(host, 2, 'root/priorities', 'priority', '前置优先判定', '按顺序检查；不满足时继续后备流程', body => {
    let any = false;
    for (const [i, stage] of D.priority_groups.entries()) {
      const groups = groupRecords(firstRecords(stage.routes)); if (!groups.length) continue; any = true;
      branch(body, 3, 'root/priorities/' + i, 'guards', stage.title, '', box => {
        for (const g of groups) renderAction(box, g, 4, 'root/priorities/' + i + '/' + g.id);
      });
    }
    if (!any) info(body, '当前条件下无可显示的优先动作。');
  });
}
function renderSelectors(host) {
  for (const [selector, pools] of visiblePools()) {
    const sk = 'root/ordinary/' + selector;
    branch(host, 3, sk, 'selector', selector, '', box => {
      for (const [id, roots] of pools) {
        const p = D.pools[id], dk = sk + '/' + id;
        branch(box, 4, dk, 'distance', poolStateLabel(roots[0]), '', distance => {
          details(distance, '选招池条件', conditions => {
            const unique = new Map(); for (const r of roots) { const list = guardList(r.path), k = JSON.stringify(list.map(g => [g.text, g.epoch])); if (!unique.has(k)) unique.set(k, list); }
            for (const list of unique.values()) { const row = el('div', 'pathline'); chips(row, list); conditions.append(row); }
          });
          branch(distance, 5, dk + '/pool', 'pool', '原始 100 权重池', '保留原始权重', pool => {
            for (const entry of p.entries) renderEntry(pool, entry, dk + '/pool/e' + entry.index);
          }, true);
        });
      }
    }, true);
  }
  if (!visiblePools().size) info(host, '当前条件下暂无选招池，可调整状态。');
}
function renderEntry(host, entry, key) {
  const records = firstRecords(entry.routes), groups = groupRecords(records);
  branch(host, 6, key, 'entry' + (!records.length ? ' excluded' : ''), '权重 ' + entry.raw_weight + ' · 入口 #' + entry.index,
    groups.length ? groups.map(g => actionName(g.id)).join(' / ') : '当前条件下暂无动作', body => {
      for (const g of groups) renderAction(body, g, 7, key + '/' + g.id);
      if (!groups.length) info(body, '此入口未显示动作，原始权重保留。');
    });
}
function renderHome() {
  branch($('tree'), 1, 'root', 'root', 'KING 自由选招', '', body => {
    renderPriorities(body);
    branch(body, 2, 'root/ordinary', 'ordinary', '进入普通加权选招', '前置优先流程未命中时继续', renderSelectors, true);
  }, true);
}
function openLocal(g) { navigate({type: 'local', group: g}); }
function renderLocal() {
  const g = view.group; $('view-title').textContent = actionName(g.id) + ' · 局部后续';
  const chain = g.records[0]?.chain || [];
  for (const [i, rid] of chain.entries()) {
    if (i) $('banner').append(el('span', 'arrow', ' → '));
    const id = requestAction(D.routes[rid]);
    const records = g.records.map(item => ({rid: item.chain[i], chain: item.chain.slice(0, i + 1)})).filter(item => item.rid && requestAction(D.routes[item.rid]) === id);
    $('banner').append(btn(actionName(id), () => openLocal({id, records})));
  }
  renderAction($('tree'), g, 1, 'local/' + g.id, 1, true);
}
function openFuturePool(records) { navigate({type: 'future-pool', records}); }
function replayPool(r) {
  let cursor = S.continuationSeed(F, D.contexts[r.source_context]);
  for (const [eid] of path(r.path)) {
    const next = P.expand(cursor, {initialGround: false}).children.find(x => x.edge.id === eid);
    if (!next) throw Error('无法恢复后续选择'); cursor = next.cursor;
  }
  return cursor;
}
function renderFuturePool() {
  $('view-title').textContent = '后续重新选招';
  const pools = new Map();
  for (const item of view.records) { const r = D.routes[item.rid]; if (!pools.has(r.node)) pools.set(r.node, []); pools.get(r.node).push(item); }
  for (const [node, records] of pools) {
    const pool = N[node].pool;
    branch($('tree'), 1, 'future/' + node, 'pool', '原始 100 权重池', '后续重新选招', body => {
      for (const e of pool.entries) branch(body, 2, 'future/' + node + '/e' + e.index, 'entry', '权重 ' + e.raw_weight + ' · 入口 #' + e.index, '', async box => {
        const token = serial, next = [], future = []; let incomplete = false; info(box, '正在读取…', 'loading'); await pause();
        for (const item of records) {
          const r = D.routes[item.rid], cursor = replayPool(r);
          const target = P.expand(cursor, {initialGround: false}).children.find(x => N[x.cursor.node].entry?.index === e.index);
          if (!target) continue;
          const result = P.walk(target.cursor, {budget: 5000, maxDepth: 180, initialGround: false});
          incomplete ||= result.incomplete;
          for (const hit of result.hits) {
            const rid = addLiveAction(hit, r.source_context), q = D.routes[rid];
            if (status(q, r.source_context, item.chain).incompatible.length) continue;
            if (N[q.node].kind === 'action') next.push({rid, chain: [...item.chain, rid]});
            else if (N[q.node].pool) future.push({rid, chain: item.chain});
          }
        }
        if (token !== serial || !box.isConnected) return;
        box.replaceChildren();
        for (const g of groupRecords(next)) renderAction(box, g, 3, 'future/' + node + '/e' + e.index + '/' + g.id);
        if (future.length) box.append(btn('继续后续选招 →', () => openFuturePool(future)));
        if (incomplete) info(box, '后续可能尚有遗漏。');
        if (!next.length && !future.length) info(box, '当前条件下暂无可显示的动作。');
      });
    }, true);
  }
}
function render() {
  serial++; bundles.clear(); $('tree').replaceChildren(); $('caption').replaceChildren(); $('banner').replaceChildren();
  $('view-title').textContent = '从自由态开始'; $('back').disabled = !history.length;
  for (const text of ['历战王 · 非疲劳', state.mode === undefined ? 'Mode 不限' : 'Mode ' + state.mode, state.charge === undefined ? 'Charge 不限' : state.charge ? 'Charge MAX' : '非 MAX', state.hp === undefined ? 'HP 不限' : 'HP ' + state.hp + '%', state.distance === undefined ? '全部距离' : '距离 ' + state.distance]) $('caption').append(el('span', 'badge', text));
  if ($('angle').value !== '') $('caption').append(el('span', 'badge', '角度参考 ' + $('angle').value + '°'));
  if (state.chain !== undefined) $('caption').append(el('span', 'badge', 'Chain ' + state.chain));
  if (view.type === 'local') renderLocal(); else if (view.type === 'future-pool') renderFuturePool(); else renderHome();
}
function navigate(next) {
  history.push({view, expanded: new Set(expanded)}); view = next; closePanel(); render(); $('tree').scrollIntoView({block: 'start'});
}
function apply() {
  for (const id of ['hp', 'distance', 'angle']) if (!$(id).checkValidity()) { $(id).reportValidity(); return; }
  state = readState(); matchCache.clear(); profileCache.clear(); statusCache.clear(); prefixCache.clear(); history.length = 0;
  view = {type: 'home'}; render(); if ($('search').value || showAll) search(showAll);
}
function initialBundle(a) { return {id: a.id, records: firstRecords(a.first_routes)}; }
function locateInitial(g) {
  const r = D.routes[g.records[0]?.rid]; if (!r) return;
  navigate({type: 'home'});
  if (r.section === 'pool') {
    const root = D.initial.find(x => x.id === r.poolroot);
    if (root) { const sk = 'root/ordinary/' + root.selector, dk = sk + '/' + r.pool, ek = dk + '/pool/e' + r.entry; [sk, dk, dk + '/pool', ek, ek + '/' + g.id].forEach(x => expanded.add(x)); }
  } else {
    expanded.add('root/priorities');
    const i = D.priority_groups.findIndex(s => s.routes.includes(r.id)); expanded.add('root/priorities/' + i); expanded.add('root/priorities/' + i + '/' + g.id);
  }
  render();
  setTimeout(() => document.querySelector('[data-action="' + g.id + '"]')?.scrollIntoView({block: 'center'}), 0);
}
function indexedRecords(a) {
  const records = [], seen = new Set();
  for (const rid of a.continuation_routes) {
    const r = D.routes[rid], witnesses = D.derivation_reachability.witnesses[r.source_context] || {};
    for (const [pair, chain] of Object.entries(witnesses)) {
      if (!(S.stateMask(state) & (1 << Number(pair))) || status(r, r.source_context, chain).incompatible.length) continue;
      const key = chain.join(',') + '|' + rid; if (!seen.has(key)) { seen.add(key); records.push({rid, chain: [...chain, rid]}); }
    }
  }
  return records;
}
function showEntries(a) {
  showPanel(actionName(a.id) + ' · 选择入口', host => {
    const first = initialBundle(a), groups = new Map();
    for (const item of first.records) {
      const r = D.routes[item.rid], key = r.section === 'pool' ? r.pool + '|' + r.entry : 'priority';
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item);
    }
    for (const records of groups.values()) {
      const r = D.routes[records[0].rid], row = el('div', 'pathline'), g = {id: a.id, records};
      info(row, r.section === 'pool' ? '普通选招 · 权重 ' + D.pools[r.pool].entries.find(e => e.index === r.entry).raw_weight : '前置优先流程');
      renderConditions(row, records); row.append(btn('在总览定位', () => locateInitial(g)), btn('查看该动作的局部后续', () => openLocal(g))); host.append(row);
    }
    const later = indexedRecords(a);
    if (later.length) {
      const row = el('div', 'pathline'); info(row, '连续派生中的动作'); row.append(btn('查看该动作的局部后续', () => openLocal({id: a.id, records: later}))); host.append(row);
    }
    if (!first.records.length && !later.length) info(host, '当前条件下暂无可显示的入口。');
  });
}
function search(all = false) {
  showAll = all; const q = $('search').value.trim().toLowerCase(); $('results').replaceChildren(); if (!q && !all) return;
  const found = Object.values(D.actions).filter(a => all || (a.name + ' ' + actionCode(a.id)).toLowerCase().includes(q));
  const box = el('div', 'card');
  for (const a of found) {
    const row = el('div', 'result'), text = el('div', 'grow'), g = initialBundle(a);
    text.append(el('div', 'action-name', a.name), el('div', 'note', actionCode(a.id))); row.append(text);
    if (g.records.length) row.append(btn('在总览定位', () => locateInitial(g)));
    row.append(btn('选择入口', () => showEntries(a))); box.append(row);
  }
  if (!found.length) info(box, '没有匹配的招式，请尝试中文名或英文动作代号。');
  $('results').append(box);
}
$('apply').onclick = apply; $('conservative').onchange = apply;
$('find').onclick = () => search(); $('search').addEventListener('input', () => search());
$('all-actions').onclick = () => search(true); $('timers').onclick = showTimers;
$('home').onclick = () => navigate({type: 'home'});
$('back').onclick = () => { const previous = history.pop(); if (!previous) return; view = previous.view; expanded.clear(); previous.expanded.forEach(k => expanded.add(k)); render(); };
$('close').onclick = closePanel; $('overlay').onclick = e => { if (e.target === $('overlay')) closePanel(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
document.querySelectorAll('[data-search]').forEach(b => b.onclick = () => { $('search').value = b.dataset.search; search(); });
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
  const values = {m0off: [0, false, 80], m0max: [0, true, 80], m1off: [1, false, 70], m1high: [1, true, 70], m1low: [1, true, 40], all: ['', '', '']}[b.dataset.preset];
  $('mode').value = values[0]; $('charge').value = String(values[1]); $('hp').value = values[2];
  if (b.dataset.preset === 'all') { $('angry').value = ''; $('distance').value = ''; }
  apply();
});
// 仅由测试环境在页面加载前显式请求测试接口；普通页面不挂载调试入口。
if (globalThis.__KING_TEST__) globalThis.KingTree = {data: D, path, match, profile, displayMatch, status, stages, grouped, groupRecords, firstRecords, collectContinuation, ensureContinuation, visiblePools, render, apply, search, indexedRecords, renderMedia, media, bundles, openLocal, getState: () => state, getView: () => view};
render();
})().catch(error => { document.getElementById('tree').textContent = '加载失败，请使用新版浏览器并检查网站文件。'; console.error(error); });
