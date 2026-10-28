import csv
import json
import os
import queue
import threading
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, ttk
from urllib.parse import quote

APP_ROOT = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'Ozon1688Helper'
PROFILE = APP_ROOT / 'browser-profile'
OUTPUT = APP_ROOT / 'exports'
DEFAULT_QUERY = '实木 旋转 吧台椅 靠背 棕色 70cm'

EXTRACT = r'''() => {
 const result = new Map();
 for (const a of document.querySelectorAll('a[href]')) {
  let u; try { u = new URL(a.href, location.href); } catch { continue; }
  if (u.hostname !== 'detail.1688.com') continue;
  const match = u.pathname.match(/^\/offer\/(\d+)\.html$/);
  if (!match) continue;
  const id = match[1];
  const own = (a.innerText || a.getAttribute('title') || '').trim();
  let parent = a; let text = own;
  for(let i=0; i<4 && parent.parentElement; i++) {
   parent = parent.parentElement;
   const value = (parent.innerText || '').trim();
   if(value.length > text.length && value.length <= 1800) text = value;
  }
  const img = a.querySelector('img') || parent.querySelector('img');
  const item = {source_item_id:id, url:'https://detail.1688.com/offer/'+id+'.html',
    title:own, visible_card_text:text,
    image_url:img ? (img.currentSrc || img.src || img.getAttribute('data-src') || '') : '',
    verification:'未核实同款、规格、价格及包装数据'};
  const previous=result.get(id);
  if (!previous || item.visible_card_text.length > previous.visible_card_text.length)
   result.set(id,item);
 }
 return [...result.values()];
}'''


def export_items(items, directory, query):
    directory.mkdir(parents=True, exist_ok=True)
    payload = {'captured_at_local': datetime.now().astimezone().isoformat(),
               'query': query, 'items': items,
               'note': '原始页面记录，不代表已确认同款、采购价、包装重量或利润。'}
    (directory / 'candidates.json').write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    with (directory / 'candidates.csv').open('w', encoding='utf-8-sig', newline='') as f:
        fields = ['source_item_id', 'url', 'title', 'visible_card_text', 'image_url', 'verification']
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: row.get(k, '') for k in fields} for row in items)


class App:
    def __init__(self, root):
        self.root = root
        self.jobs = queue.Queue()
        self.events = queue.Queue()
        self.busy = False
        self.last_export = None
        root.title('1688 搜货助手 — 本地登录与导出')
        root.geometry('850x600')
        ttk.Label(root, text='登录和滑块请在浏览器内完成；不要向聊天发送密码或登录文件。',
                  wraplength=800).pack(padx=15, pady=12)
        self.query = tk.StringVar(value=DEFAULT_QUERY)
        ttk.Entry(root, textvariable=self.query, width=95).pack(padx=15, fill='x')
        buttons = ttk.Frame(root)
        buttons.pack(pady=12)
        self.controls = []
        for title, command in [('1. 打开1688', 'open'), ('2. 搜索', 'search'),
                               ('3. 收集并导出当前结果', 'collect')]:
            button = ttk.Button(buttons, text=title, command=lambda c=command: self.submit(c))
            button.pack(side='left', padx=5)
            self.controls.append(button)
        ttk.Button(root, text='打开导出目录', command=self.open_exports).pack()
        ttk.Label(root, text='搜索后如出现验证，请手动完成；结果显示后点击“收集并导出”。\n'
                  '可自行翻页或使用平台以图搜货，再点击收集；同一会话的候选会按商品ID去重。',
                  wraplength=800).pack(padx=15, pady=12)
        self.logbox = tk.Text(root, wrap='word', height=20, state='disabled')
        self.logbox.pack(padx=15, pady=5, fill='both', expand=True)
        root.protocol('WM_DELETE_WINDOW', self.close)
        threading.Thread(target=self.worker, daemon=True).start()
        root.after(100, self.poll)
        self.events.put(('log', '请先打开1688，在浏览器内登录，再搜索。首次启动浏览器可能需要数秒。'))

    def submit(self, cmd):
        if self.busy:
            return
        query = self.query.get().strip()
        if cmd == 'search' and not query:
            messagebox.showinfo('提示', '请输入搜索词。')
            return
        self.busy = True
        for b in self.controls:
            b.configure(state='disabled')
        self.jobs.put((cmd, query))

    def poll(self):
        while not self.events.empty():
            kind, value = self.events.get()
            if kind == 'done':
                self.busy = False
                for b in self.controls:
                    b.configure(state='normal')
            elif kind == 'export':
                self.last_export = Path(value)
            else:
                self.logbox.configure(state='normal')
                self.logbox.insert('end', value + '\n')
                self.logbox.see('end')
                self.logbox.configure(state='disabled')
        self.root.after(100, self.poll)

    def open_exports(self):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        os.startfile(str(self.last_export or OUTPUT))

    def close(self):
        self.jobs.put(('quit', ''))
        self.root.destroy()

    def worker(self):
        context = None
        merged = {}
        active_query = ''
        run_dir = None
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as pw:
                while True:
                    cmd, query = self.jobs.get()
                    if cmd == 'quit':
                        break
                    try:
                        if context is None:
                            PROFILE.mkdir(parents=True, exist_ok=True)
                            context = pw.chromium.launch_persistent_context(
                                str(PROFILE), headless=False, no_viewport=True,
                                accept_downloads=False,
                                args=['--start-maximized'])
                        pages = context.pages
                        page = pages[-1] if pages else context.new_page()
                        if cmd == 'open':
                            page.goto('https://www.1688.com/', wait_until='domcontentloaded', timeout=45000)
                            self.events.put(('log', '1688已打开。请在官方网站内登录；随后点击“搜索”。'))
                        elif cmd == 'search':
                            merged = {}
                            active_query = query
                            run_dir = OUTPUT / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
                            url = 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + quote(query, encoding='gbk', errors='xmlcharrefreplace')
                            page.goto(url, wait_until='domcontentloaded', timeout=45000)
                            self.events.put(('log', '已提交搜索。若有滑块请手动完成，商品卡片出现后点击“收集并导出”。'))
                        elif cmd == 'collect':
                            if '1688.com' not in page.url:
                                raise RuntimeError('当前页面不是1688，请切回1688商品列表。')
                            for _ in range(3):
                                for item in page.evaluate(EXTRACT):
                                    merged[item['source_item_id']] = item
                                page.mouse.wheel(0, 650)
                                page.wait_for_timeout(700)
                            if not merged:
                                self.events.put(('log', '未识别到有效商品链接，不能算搜索成功。请检查是否仍在登录、验证或加载页面。可使用平台自己的搜图入口后重试。'))
                            else:
                                if run_dir is None:
                                    run_dir = OUTPUT / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
                                export_items(list(merged.values()), run_dir, active_query or query)
                                self.events.put(('export', str(run_dir)))
                                self.events.put(('log', f'已导出 {len(merged)} 个去重候选：{run_dir}\n请上传 candidates.json 或 candidates.csv，我继续进行同款比对。文件不包含登录凭据。'))
                    except Exception as exc:
                        self.events.put(('log', '操作未完成：' + str(exc)[:650]))
                    finally:
                        self.events.put(('done', ''))
                if context:
                    context.close()
        except Exception as exc:
            self.events.put(('log', '浏览器组件启动失败：' + str(exc)[:500] + '\n请重新运行安装并启动.bat。'))
            self.events.put(('done', ''))


if __name__ == '__main__':
    root = tk.Tk()
    App(root)
    root.mainloop()
