export function closest(years) {
  if (years.length !== 4 || years.some(year => !/^\d{1,4}$/.test(year) || +year < 1)) return [];
  const distances = years.map(year => Math.abs(+year - 1955));
  return distances.flatMap((distance, index) => distance === Math.min(...distances) ? [index] : []);
}

export function leaders(bids, scores) {
  if (bids.some((bid,index) => bid !== '' && (!/^\d+$/.test(bid) || +bid <= 0 || +bid > scores[index]))) return null;
  const maximum = Math.max(...bids.map(Number));
  return bids.flatMap((bid,index) => maximum > 0 && +bid === maximum ? [index] : []);
}

export function award(state, id, team, delta) {
  const result = state.results[id] ??= {};
  if (Object.hasOwn(result, team) || !Number.isSafeInteger(state.teams[team].score + delta)) return false;
  result[team] = delta;
  state.teams[team].score += delta;
  return true;
}

export function validSpecial(type, detail, result) {
  if (type === 'Кот в мешке') {
    return detail.target === undefined || (detail.source !== undefined && detail.source !== detail.target);
  }
  if (type === 'Аукцион') {
    const bids = detail.bids?.map(Number) ?? [];
    if (bids.some(bid => !Number.isSafeInteger(bid))) return false;
    if (detail.bid !== undefined || detail.tied !== undefined) {
      if (!Array.isArray(detail.limits) || detail.limits.length !== 4 ||
          detail.limits.some(score => !Number.isSafeInteger(score)) ||
          bids.some((bid,i) => bid > 0 && bid > detail.limits[i])) return false;
    }
    if (result && Object.keys(result).length &&
        (detail.bid === undefined || Object.entries(result).some(([i,delta]) =>
          +i !== detail.target || Math.abs(delta) !== detail.bid))) return false;
    const maximum = Math.max(0,...bids);
    const highest = bids.flatMap((bid,i) => maximum > 0 && bid === maximum ? [i] : []);
    if (detail.bid !== undefined) {
      return detail.tied === undefined && detail.bid === maximum && highest.includes(detail.target);
    }
    if (detail.tied !== undefined) {
      return highest.length > 1 && highest.join(',') === detail.tied.join(',');
    }
  }
  if (type === 'Точный ответ' && detail.winners !== undefined) {
    const winners = closest(detail.years ?? []);
    return detail.source !== undefined && winners.length > 0 && winners.join(',') === detail.winners.join(',');
  }
  return true;
}
