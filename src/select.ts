import {icon} from './icons.js';

export function installSelects() {
  const controls = new Map();
  let active;

  function enhance(select: HTMLSelectElement) {
    const wrapper = document.createElement('span');
    wrapper.className = 'select-control';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.setAttribute('aria-haspopup',String( 'listbox'));
    trigger.setAttribute('aria-expanded',String( 'false'));
    trigger.innerHTML = '<span></span>' + icon('chevron');
    const menu = document.createElement('div');
    menu.className = 'select-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'listbox');
    menu.id = 'select-menu-' + controls.size + '-' + Math.random().toString(36).slice(2);
    trigger.setAttribute('aria-controls',String( menu.id));
    select.before(wrapper);
    wrapper.append(select, trigger, menu);
    select.classList.add('select-source');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden',String( 'true'));
    const label = select.getAttribute('aria-label') || select.closest('label')?.querySelector<HTMLElement>('span')?.textContent || select.id;
    trigger.setAttribute('aria-label',String( label));
    menu.setAttribute('aria-label',String( label));

    function sync() {
      const text = select.selectedOptions[0]?.textContent || 'Select';
      if (trigger.firstElementChild.textContent !== text) trigger.firstElementChild.textContent = text;
      if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
      if (select.disabled && menu.matches(':popover-open')) menu.hidePopover();
    }
    function open() {
      if (select.disabled) return;
      if (active && active !== menu && active.matches(':popover-open')) active.hidePopover();
      menu.replaceChildren();
      for (const option of select.options) {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected',String(option.selected));
        item.disabled = option.disabled;
        item.textContent = option.textContent;
        item.insertAdjacentHTML('beforeend', icon('check'));
        item.onclick = () => {
          select.value = option.value;
          menu.hidePopover();
          trigger.focus();
          sync();
          select.dispatchEvent(new Event('input', {bubbles:true}));
          select.dispatchEvent(new Event('change', {bubbles:true}));
        };
        menu.append(item);
      }
      menu.showPopover({source:trigger});
      active = menu;
      const rect = trigger.getBoundingClientRect();
      menu.style.width = Math.max(160, rect.width) + 'px';
      menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.max(8, rect.bottom + menu.offsetHeight + 6 < innerHeight ? rect.bottom + 6 : rect.top - menu.offsetHeight - 6) + 'px';
      (menu.querySelector<HTMLElement>('[aria-selected="true"]:enabled') || menu.querySelector<HTMLElement>('button:enabled'))?.focus();
    }
    trigger.onclick = () => menu.matches(':popover-open') ? menu.hidePopover() : open();
    trigger.onkeydown = event => {
      event.stopPropagation();
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
    };
    menu.addEventListener('toggle', () => trigger.setAttribute('aria-expanded',String(menu.matches(':popover-open'))));
    let search = '';
    let searchedAt = 0;
    menu.onkeydown = event => {
      event.stopPropagation();
      const items = [...menu.querySelectorAll<HTMLElement>('button:enabled')];
      const index = items.indexOf((document.activeElement as HTMLElement));
      let next;
      if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
      if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
      if (event.key === 'Home') next = items[0];
      if (event.key === 'End') next = items.at(-1);
      if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
        search = (Date.now() - searchedAt < 600 ? search : '') + event.key.toLowerCase();
        searchedAt = Date.now();
        next = items.find(item => item.textContent.toLowerCase().startsWith(search));
      }
      if (next) { event.preventDefault(); next.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); menu.hidePopover(); trigger.focus(); }
      if (event.key === 'Tab') { menu.hidePopover(); trigger.focus(); }
    };
    select.addEventListener('change', sync);
    controls.set(select, {wrapper, sync});
    sync();
  }
  function refresh() {
    for (const [select, control] of controls) {
      if (!select.isConnected) controls.delete(select);
      else control.sync();
    }
    document.querySelectorAll<HTMLElement>('select:not(.select-source)').forEach(enhance);
  }
  new MutationObserver(records => {
    // Only source controls matter. Generated buttons must not trigger a resync.
    if (records.some(record => record.type === 'childList' || (record.target as HTMLElement).matches('select, option, optgroup'))) refresh();
  }).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled','selected']});
  const dismiss = event => {
    if (active?.matches(':popover-open') && !active.contains((event.target as HTMLInputElement))) active.hidePopover();
  };
  window.addEventListener('resize', dismiss);
  document.addEventListener('scroll', dismiss, true);
  refresh();
}
