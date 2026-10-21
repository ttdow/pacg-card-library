/* Analytical distributions for sums of independent, fair polyhedral dice. */
(function (root) {
  'use strict';
  const SIDES = [4,6,8,10,12,20];
  const MAX_COUNT = 10;
  const emptyPool = () => Object.fromEntries(SIDES.map(sides => [sides,0]));
  const defaultPool = emptyPool;

  function parsePool(text) {
    if (!text) return defaultPool();
    if (text === '0') return emptyPool();
    const counts = emptyPool();
    for (const part of text.trim().split(/[+\s]+/)) {
      const match = part.match(/^(\d{1,3})d(4|6|8|10|12|20)$/i);
      if (!match) return defaultPool();
      counts[match[2]] = Math.min(MAX_COUNT,counts[match[2]] + Number(match[1]));
    }
    return counts;
  }

  function notation(counts) {
    return SIDES.filter(sides => counts[sides]).map(sides => `${counts[sides]}d${sides}`).join(' + ') || 'No dice selected';
  }

  function distribution(counts) {
    let probabilities = new Float64Array([1]);
    let minimum = 0, maximum = 0, expected = 0;
    for (const sides of SIDES) {
      const count = counts[sides] ?? 0;
      if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) throw new RangeError(`Choose 0–${MAX_COUNT} d${sides} dice.`);
      minimum += count;
      maximum += count * sides;
      expected += count * (sides + 1) / 2;
      for (let die = 0; die < count; die++) {
        const next = new Float64Array(probabilities.length + sides);
        for (let total = 0; total < probabilities.length; total++) {
          const chance = probabilities[total] / sides;
          for (let face = 1; face <= sides; face++) next[total + face] += chance;
        }
        probabilities = next;
      }
    }
    const cumulative = new Float64Array(probabilities.length);
    let chance = 0;
    probabilities.forEach((value,total) => { chance += value; cumulative[total] = Math.min(1,chance); });
    cumulative[maximum] = 1;
    return {probabilities,cumulative,minimum,maximum,expected,dice:minimum};
  }

  function create({onChange} = {}) {
    const $ = id => document.getElementById(id);
    const controls = $('dice-controls');
    const host = $('dice-chart');
    const inputs = new Map();
    let counts = defaultPool(), model, plot, selected, lastWidth = 0;
    const number = value => new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value);
    const percent = value => new Intl.NumberFormat(undefined,{style:'percent',maximumSignificantDigits:4,
      notation:value > 0 && value < .00001 ? 'scientific' : 'standard'}).format(value);
    const node = (tag,className,text) => {
      const item = document.createElement(tag);
      if (className) item.className = className;
      if (text != null) item.textContent = text;
      return item;
    };
    const svgNode = (tag,attributes = {},text) => {
      const item = document.createElementNS('http://www.w3.org/2000/svg',tag);
      for (const [key,value] of Object.entries(attributes)) item.setAttribute(key,String(value));
      if (text != null) item.textContent = text;
      return item;
    };
    const tooltip = node('div','dice-tooltip');
    tooltip.id = 'dice-tooltip';
    tooltip.setAttribute('role','tooltip');
    tooltip.setAttribute('aria-live','polite');
    tooltip.hidden = true;
    function hideTooltip() {
      tooltip.hidden = true;
      plot?.highlight.setAttribute('visibility','hidden');
      host.setAttribute('aria-describedby','dice-summary dice-chart-help');
    }
    function inspect(total) {
      if (!model?.dice || !plot) return;
      selected = Math.max(model.minimum,Math.min(model.maximum,total));
      tooltip.textContent = `Roll ${number(selected)} or less: ${percent(model.cumulative[selected])}`;
      tooltip.hidden = false;
      host.setAttribute('aria-describedby','dice-summary dice-chart-help dice-tooltip');
      plot.highlight.setAttribute('visibility','visible');
      plot.highlight.setAttribute('x',plot.x(selected - .5));
      plot.highlight.setAttribute('y',plot.y(model.probabilities[selected]));
      plot.highlight.setAttribute('height',plot.bottom - plot.y(model.probabilities[selected]));
      const left = Math.max(8,Math.min(plot.width-tooltip.offsetWidth-8,plot.x(selected)-tooltip.offsetWidth/2));
      const above = plot.y(model.probabilities[selected])-tooltip.offsetHeight-10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${above >= 4 ? above : plot.y(model.probabilities[selected])+12}px`;
    }
    function niceStep(value) {
      const scale = 10 ** Math.floor(Math.log10(value));
      const fraction = value / scale;
      return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * scale;
    }
    function draw() {
      const width = Math.round(host.getBoundingClientRect().width);
      if (!width) return;
      lastWidth = width;
      hideTooltip();
      host.replaceChildren();
      plot = null;
      if (!model.dice) {
        host.append(node('p','dice-empty','Choose at least one die to see its roll distribution.'));
        return;
      }
      const height = width < 500 ? 280 : 340;
      const left = 58, right = width - 18, top = 30, bottom = height - 48;
      const x = total => left + (total - model.minimum + .5) / (model.maximum - model.minimum + 1) * (right - left);
      let peak = 0;
      for (const chance of model.probabilities) peak = Math.max(peak,chance);
      const step = niceStep(peak / 4), ceiling = Math.ceil(peak / step) * step;
      const y = chance => bottom - chance / ceiling * (bottom - top);
      const svg = svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${notation(counts)}: roll probabilities`,'aria-describedby':'dice-svg-description'});
      svg.append(svgNode('desc',{id:'dice-svg-description'},`Expected total ${number(model.expected)}. Minimum ${model.minimum}, maximum ${model.maximum}. Each bar shows the probability of one total.`));
      svg.append(svgNode('text',{x:left,y:15,class:'dice-axis-label'},'Probability'));
      for (let index = 0; index <= Math.round(ceiling / step); index++) {
        const chance = index * step;
        svg.append(svgNode('line',{x1:left,x2:right,y1:y(chance),y2:y(chance),class:'dice-grid-line'}));
        svg.append(svgNode('text',{x:left-9,y:y(chance)+4,'text-anchor':'end',class:'dice-axis-label'},percent(chance)));
      }
      const barWidth = (right - left) / (model.maximum - model.minimum + 1);
      const bars = svgNode('g',{class:'dice-bars'});
      for (let total = model.minimum; total <= model.maximum; total++) {
        const bar = svgNode('rect',{x:x(total-.5)+barWidth*.06,y:y(model.probabilities[total]),
          width:barWidth*.88,height:bottom-y(model.probabilities[total]),'data-total':total});
        bars.append(bar);
      }
      svg.append(bars);
      const highlight = svgNode('rect',{width:barWidth,class:'dice-bar-highlight','pointer-events':'none',visibility:'hidden'});
      svg.append(highlight);
      svg.append(svgNode('line',{x1:x(model.expected),x2:x(model.expected),y1:top,y2:bottom,class:'dice-mean-line'}));
      const tickStep = Math.max(1,niceStep((model.maximum-model.minimum) / Math.max(2,Math.floor((right-left)/65))));
      const ticks = [model.minimum];
      for (let tick = Math.ceil(model.minimum / tickStep) * tickStep; tick < model.maximum; tick += tickStep) {
        if (x(tick) - x(ticks.at(-1)) > 38 && x(model.maximum) - x(tick) > 38) ticks.push(tick);
      }
      if (model.maximum !== model.minimum) ticks.push(model.maximum);
      for (const total of ticks) svg.append(svgNode('text',{x:x(total),y:bottom+20,'text-anchor':'middle',class:'dice-axis-label'},number(total)));
      svg.append(svgNode('text',{x:(left+right)/2,y:height-6,'text-anchor':'middle',class:'dice-axis-label'},'Total roll'));
      host.append(svg,tooltip);
      plot = {x,y,left,right,bottom,width,highlight};
    }
    function update(notify = true) {
      model = distribution(counts);
      selected = Math.round(model.expected);
      for (const [sides,input] of inputs) {
        input.value = counts[sides];
        $(`dice-count-${sides}`).value = String(counts[sides]);
        input.setAttribute('aria-valuetext',`${counts[sides]} d${sides} ${counts[sides] === 1 ? 'die' : 'dice'}`);
      }
      $('dice-pool').textContent = notation(counts);
      $('dice-expected').textContent = model.dice ? number(model.expected) : '—';
      $('dice-minimum').textContent = model.dice ? number(model.minimum) : '—';
      $('dice-maximum').textContent = model.dice ? number(model.maximum) : '—';
      $('dice-summary').textContent = model.dice ? `${notation(counts)}. Expected total ${number(model.expected)}; minimum ${model.minimum}, maximum ${model.maximum}.` : 'No dice selected.';
      host.tabIndex = model.dice ? 0 : -1;
      draw();
      if (notify) onChange?.(model.dice ? notation(counts).replaceAll(' ','') : '0');
    }
    for (const sides of SIDES) {
      const control = node('div','die-control');
      const heading = node('div','die-control-heading');
      const label = node('label','',`d${sides}`);
      label.htmlFor = `dice-d${sides}`;
      const output = node('output','',0);
      output.id = `dice-count-${sides}`;
      output.setAttribute('for',`dice-d${sides}`);
      heading.append(label,output);
      const input = node('input');
      input.type = 'range'; input.min = 0; input.max = MAX_COUNT; input.step = 1;
      input.id = `dice-d${sides}`;
      input.setAttribute('aria-label',`Number of d${sides} dice`);
      input.addEventListener('input',() => { counts[sides] = Number(input.value); update(); });
      const limits = node('div','die-control-limits');
      limits.setAttribute('aria-hidden','true');
      limits.append(node('span','',0),node('span','',MAX_COUNT));
      control.append(heading,input,limits);
      controls.append(control);
      inputs.set(sides,input);
    }
    $('dice-clear').addEventListener('click',() => { counts = emptyPool(); update(); });
    const inspectPointer = event => {
      if (!plot) return;
      const bar = event.target.closest?.('.dice-bars rect');
      if (!bar) { hideTooltip(); return; }
      inspect(Number(bar.dataset.total));
    };
    host.addEventListener('pointermove',inspectPointer);
    host.addEventListener('pointerdown',event => {
      if (event.target.closest?.('.dice-bars rect')) {
        event.preventDefault();
        host.focus({preventScroll:true});
      }
      inspectPointer(event);
    });
    host.addEventListener('pointerleave',hideTooltip);
    host.addEventListener('blur',hideTooltip);
    host.addEventListener('focus',() => inspect(selected ?? Math.round(model.expected)));
    document.addEventListener('pointerdown',event => { if (!host.contains(event.target)) hideTooltip(); });
    host.addEventListener('keydown',event => {
      if (event.key === 'Escape') { hideTooltip(); return; }
      if (!model.dice || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      inspect(event.key === 'Home' ? model.minimum : event.key === 'End' ? model.maximum : selected + (event.key === 'ArrowLeft' ? -1 : 1));
    });
    new ResizeObserver(() => {
      const width = Math.round(host.getBoundingClientRect().width);
      if (model && width && width !== lastWidth) draw();
    }).observe(host);
    return {setPool(text) { counts = parsePool(text); update(false); }};
  }
  const api = {SIDES,MAX_COUNT,parsePool,notation,distribution,create};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PACGDice = api;
})(typeof window !== 'undefined' ? window : globalThis);
