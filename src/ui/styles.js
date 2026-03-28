export function injectStyles() {
  const css = `
    /* ====== 控制面板极简现代重构 ====== */
    #boss-helper-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 340px;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
      z-index: 9999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1e293b;
      border: 1px solid rgba(0, 0, 0, 0.06);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s;
      user-select: none;
      overflow: hidden;
    }
    #boss-helper-panel.minimized {
      transform: translateX(360px);
      opacity: 0;
      pointer-events: none;
    }

    /* 顶部导航条 */
    .bh-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      padding-bottom: 12px;
      background: transparent;
      cursor: move;
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    }
    .bh-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.3px;
      color: #0f172a;
    }
    .bh-logo {
      width: 18px;
      height: 18px;
      color: #3b82f6;
    }
    .bh-btn-icon {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .bh-btn-icon:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    /* 面板主体内容区 */
    .bh-body {
      padding: 16px 20px;
      max-height: calc(100vh - 160px);
      overflow-y: auto;
    }
    .bh-body::-webkit-scrollbar { width: 4px; }
    .bh-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }

    /* 通用间距 */
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .mb-1 { margin-bottom: 4px; }
    .mb-12 { margin-bottom: 12px; }

    /* Header 内联状态指示器 */
    .bh-brand .bh-status {
      margin-left: 8px;
      font-size: 11px;
      padding: 2px 8px;
    }
    .bh-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
    }
    .bh-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .bh-status.ok { background: #ecfdf5; color: #059669; }
    .bh-status.ok .bh-status-dot { background: #10b981; }
    .bh-status.running { background: #eff6ff; color: #2563eb; }
    .bh-status.running .bh-status-dot { background: #3b82f6; animation: bh-pulse 1.5s infinite; }
    .bh-status.error { background: #fef2f2; color: #dc2626; }
    .bh-status.error .bh-status-dot { background: #ef4444; }

    @keyframes bh-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    /* 核心数据看板 */
    .bh-dashboard {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .bh-card {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 12px;
      padding: 12px 10px;
      text-align: center;
      transition: transform 0.2s;
    }
    .bh-card:hover { background: #f1f5f9; }
    .bh-card.highlight { background: #eff6ff; border-color: #dbeafe; }
    .bh-card.highlight .bh-card-value { color: #2563eb; }
    .bh-card-title {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .bh-card-value {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1;
      font-family: 'Inter', sans-serif;
    }

    /* 标签分布统计 */
    .bh-dist-group {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .bh-dist-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .bh-dist-item.c9 { background: #fef2f2; color: #b91c1c; }
    .bh-dist-item.n985 { background: #fffbeb; color: #b45309; }
    .bh-dist-item.n211 { background: #f0f9ff; color: #0369a1; }
    .bh-dist-item.custom { background: #f0fdf4; color: #166534; }
    .bh-d-label { 
      opacity: 0.8; 
      font-size: 11px; 
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 4px;
    }
    .bh-d-val { font-size: 14px; }

    /* 学校输入提示 */
    .bh-hint {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
      line-height: 1.4;
    }
    .bh-school-textarea {
      font-size: 12px;
      line-height: 1.5;
      min-height: 100px;
    }

    /* 操作按钮 */
    .bh-action-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .bh-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 0;
      white-space: nowrap;
    }
    .bh-primary { background: #0f172a; color: white; }
    .bh-primary:hover { background: #1e293b; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15); }
    .bh-secondary { background: #f1f5f9; color: #0f172a; }
    .bh-secondary:hover { background: #e2e8f0; }
    .bh-danger { background: #fef2f2; color: #dc2626; }
    .bh-danger:hover { background: #fee2e2; }
    .bh-outline { background: transparent; border: 1px solid #cbd5e1; color: #334155; padding: 8px; }
    .bh-outline:hover { background: #f8fafc; border-color: #94a3b8; }
    .bh-btn-sm-ghost { background: transparent; color: #3b82f6; border: none; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px; }
    .bh-btn-sm-ghost:hover { text-decoration: underline; }
    .bh-w-full { width: 100%; }

    /* 分割线 */
    .bh-separator {
      height: 1px;
      background: #f1f5f9;
      margin: 16px 0;
    }

    /* 手风琴折叠菜单 */
    .bh-accordion {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
    }
    .bh-accordion:hover { color: #0f172a; }
    .bh-arrow { transition: transform 0.3s; color: #94a3b8; }
    .bh-collapse {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-in-out;
    }
    .bh-collapse.open { max-height: 600px; }

    /* 表单控件 */
    .bh-control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      color: #475569;
    }
    .bh-input-box {
      width: 80px;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #f8fafc;
      text-align: right;
      outline: none;
      transition: all 0.2s;
    }
    .bh-input-box:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    .bh-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      background: #f8fafc;
      box-sizing: border-box;
      outline: none;
      resize: vertical;
      transition: all 0.2s;
    }
    .bh-textarea:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

    /* Switch开关 */
    .bh-switch-group { margin-bottom: 8px; }
    .bh-switch-label {
      display: flex;
      align-items: center;
      cursor: pointer;
      gap: 10px;
      margin-bottom: 8px;
    }
    .bh-switch-input { display: none; }
    .bh-switch-ui {
      width: 32px;
      height: 18px;
      border-radius: 10px;
      background: #cbd5e1;
      position: relative;
      transition: background 0.3s;
    }
    .bh-switch-ui::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .bh-switch-input:checked + .bh-switch-ui { background: #0f172a; }
    .bh-switch-input:checked + .bh-switch-ui::after { transform: translateX(14px); }
    .bh-switch-text { color: #475569; font-weight: 500; }
    .bh-label-with-help {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .bh-help-tip {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      outline: none;
    }
    .bh-help-icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: #e2e8f0;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      transition: all 0.2s;
    }
    .bh-help-bubble {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%) translateY(4px);
      width: 220px;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.96);
      color: #f8fafc;
      font-size: 11px;
      line-height: 1.5;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: all 0.2s ease;
      z-index: 3;
      white-space: normal;
    }
    .bh-help-tip:hover .bh-help-bubble,
    .bh-help-tip:focus-within .bh-help-bubble {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }
    .bh-help-tip:hover .bh-help-icon,
    .bh-help-tip:focus-within .bh-help-icon {
      background: #cbd5e1;
      color: #0f172a;
    }

    /* Filter rules */
    .bh-filter-rules {
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px;
      margin-top: 12px;
      border: 1px solid #f1f5f9;
    }
    .bh-rule-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .bh-tags-selector {
      display: flex;
      gap: 8px;
    }
    .bh-check-badge {
      flex: 1;
      cursor: pointer;
    }
    .bh-check-badge input { display: none; }
    .bh-check-badge span {
      display: block;
      text-align: center;
      padding: 6px 0;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: white;
      color: #64748b;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s;
    }
    .bh-check-badge input:checked + span {
      background: #0f172a;
      color: white;
      border-color: #0f172a;
    }

    /* 话术列表 */
    .bh-greeting-list { margin-top: 8px; }
    .bh-greeting-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f8fafc;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 6px;
      border: 1px solid #f1f5f9;
    }
    .bh-greeting-text {
      flex: 1;
      font-size: 12px;
      color: #475569;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bh-greeting-del {
      color: #94a3b8;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border-radius: 4px;
    }
    .bh-greeting-del:hover { color: #ef4444; background: #fee2e2; }

    /* 底部链接 */
    .bh-footer-nav {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .bh-link {
      font-size: 12px;
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
      cursor: pointer;
    }
    .bh-link:hover { text-decoration: underline; }
    .bh-link-danger { color: #ef4444; cursor: pointer;}

    /* 终端日志记录 */
    .bh-terminal-title {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .bh-terminal {
      background: #0f172a;
      border-radius: 8px;
      padding: 10px;
      height: 120px;
      overflow-y: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 10px;
      line-height: 1.5;
      color: #94a3b8;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
    }
    .bh-terminal::-webkit-scrollbar { width: 4px; }
    .bh-terminal::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
    .bh-log-entry.info .msg { color: #38bdf8; }
    .bh-log-entry.warn .msg { color: #fbbf24; }
    .bh-log-entry.error .msg { color: #f87171; }
    .bh-log-entry .time { opacity: 0.5; margin-right: 6px; }

    /* ====== 目标卡片高亮及角标重构 (保留原逻辑优化视觉) ====== */
    .boss-helper-target {
      position: relative;
      transition: all 0.3s ease;
      z-index: 10;
    }
    
    .bh-recommend-mode .boss-helper-target.bh-target-C9 {
      border: 2px solid #ef4444 !important;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.15) !important;
      background: linear-gradient(135deg, #fef2f2 0%, #ffffff 40%) !important;
    }
    .bh-recommend-mode .boss-helper-target.bh-target-n985 {
      border: 2px solid #f59e0b !important;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.15) !important;
      background: linear-gradient(135deg, #fffbeb 0%, #ffffff 40%) !important;
    }
    .bh-recommend-mode .boss-helper-target.bh-target-n211 {
      border: 2px solid #3b82f6 !important;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.15) !important;
      background: linear-gradient(135deg, #eff6ff 0%, #ffffff 40%) !important;
    }
    .bh-recommend-mode .boss-helper-target.bh-target-strong {
      border: 2px solid #10b981 !important;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15) !important;
      background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 40%) !important;
    }
    .bh-recommend-mode .boss-helper-target.bh-target-top50 {
      border: 2px solid #8b5cf6 !important;
      box-shadow: 0 4px 16px rgba(139, 92, 246, 0.15) !important;
      background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 40%) !important;
    }
    .bh-recommend-mode .boss-helper-target.bh-target-overseas {
      border: 2px solid #64748b !important;
      box-shadow: 0 4px 16px rgba(100, 116, 139, 0.15) !important;
      background: linear-gradient(135deg, #f8fafc 0%, #ffffff 40%) !important;
    }

    /* 悬浮角标 */
    .bh-recommend-mode .boss-helper-target::before {
      border-top-left-radius: 7px;
      content: attr(data-school-label);
      position: absolute;
      top: 0;
      left: 0;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 800;
      color: white;
      background: linear-gradient(135deg, #10b981, #059669); /* 自定义标签的默认背景色 */
      border-bottom-right-radius: 10px;
      z-index: 20;
      letter-spacing: 1px;
      box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
    }
    .bh-recommend-mode .boss-helper-target.bh-target-C9::before { background: linear-gradient(135deg, #ef4444, #dc2626); }
    .bh-recommend-mode .boss-helper-target.bh-target-n985::before { background: linear-gradient(135deg, #f59e0b, #d97706); }
    .bh-recommend-mode .boss-helper-target.bh-target-n211::before { background: linear-gradient(135deg, #3b82f6, #2563eb); }
    .bh-recommend-mode .boss-helper-target.bh-target-strong::before { background: linear-gradient(135deg, #10b981, #059669); }
    .bh-recommend-mode .boss-helper-target.bh-target-top50::before { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
    .bh-recommend-mode .boss-helper-target.bh-target-overseas::before { background: linear-gradient(135deg, #64748b, #475569); }

    .bh-chat-mode .boss-helper-target {
      --bh-chat-accent: #10b981;
      --bh-chat-glow: rgba(16, 185, 129, 0.10);
    }
    .bh-chat-mode .boss-helper-target.bh-target-C9 {
      --bh-chat-accent: #ef4444;
      --bh-chat-glow: rgba(239, 68, 68, 0.12);
    }
    .bh-chat-mode .boss-helper-target.bh-target-n985 {
      --bh-chat-accent: #f59e0b;
      --bh-chat-glow: rgba(245, 158, 11, 0.12);
    }
    .bh-chat-mode .boss-helper-target.bh-target-n211 {
      --bh-chat-accent: #3b82f6;
      --bh-chat-glow: rgba(59, 130, 246, 0.12);
    }
    .bh-chat-mode .boss-helper-target.bh-target-strong {
      --bh-chat-accent: #10b981;
      --bh-chat-glow: rgba(16, 185, 129, 0.12);
    }
    .bh-chat-mode .boss-helper-target.bh-target-top50 {
      --bh-chat-accent: #8b5cf6;
      --bh-chat-glow: rgba(139, 92, 246, 0.12);
    }
    .bh-chat-mode .boss-helper-target.bh-target-overseas {
      --bh-chat-accent: #64748b;
      --bh-chat-glow: rgba(100, 116, 139, 0.12);
    }
    .bh-chat-mode .boss-helper-target > .geek-item {
      border-radius: 12px;
      box-shadow: inset 4px 0 0 var(--bh-chat-accent), 0 8px 18px rgba(15, 23, 42, 0.04);
      background-image: linear-gradient(90deg, var(--bh-chat-glow) 0%, rgba(255, 255, 255, 0) 38%);
    }

    /* 内部备用小标签 */
    .bh-card-label {
      display: inline-block;
      margin-left: 8px;
      padding: 0 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      vertical-align: middle;
      box-sizing: border-box;
      z-index: 2;
      background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; /* 自定义标签默认样式 */
    }
    .bh-card-label.C9 { background: #fef2f2 !important; color: #b91c1c !important; border-color: #fecaca !important; }
    .bh-card-label.n985 { background: #fffbeb !important; color: #b45309 !important; border-color: #fde68a !important; }
    .bh-card-label.n211 { background: #f0f9ff !important; color: #0369a1 !important; border-color: #bfdbfe !important; }
    .bh-card-label.strong { background: #ecfdf5 !important; color: #047857 !important; border-color: #a7f3d0 !important; }
    .bh-card-label.top50 { background: #f5f3ff !important; color: #6d28d9 !important; border-color: #ddd6fe !important; }
    .bh-card-label.overseas { background: #f8fafc !important; color: #334155 !important; border-color: #cbd5e1 !important; }
    .bh-chat-inline-label {
      margin-left: 6px;
      padding: 0 8px;
      border-radius: 999px;
      line-height: 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2px;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
      transform: translateY(-1px);
    }
    .bh-chat-school-label {
      margin-left: 8px;
      padding: 0 8px;
      border-radius: 999px;
      line-height: 20px;
      font-size: 11px;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      vertical-align: middle;
    }
    .bh-chat-target-summary {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid #dbeafe;
      background: linear-gradient(135deg, #f8fbff 0%, #ffffff 100%);
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
    }
    .bh-chat-target-summary.C9 { border-color: #fecaca; background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%); }
    .bh-chat-target-summary.n985 { border-color: #fde68a; background: linear-gradient(135deg, #fffaf0 0%, #ffffff 100%); }
    .bh-chat-target-summary.n211 { border-color: #bfdbfe; background: linear-gradient(135deg, #f5f9ff 0%, #ffffff 100%); }
    .bh-chat-target-summary.strong { border-color: #a7f3d0; background: linear-gradient(135deg, #f0fdf7 0%, #ffffff 100%); }
    .bh-chat-target-summary.top50 { border-color: #ddd6fe; background: linear-gradient(135deg, #faf7ff 0%, #ffffff 100%); }
    .bh-chat-target-summary.overseas { border-color: #cbd5e1; background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); }
    .bh-chat-target-summary.is-mode-mismatch {
      border-style: dashed;
      opacity: 0.9;
    }
    .bh-chat-target-summary-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .bh-chat-target-summary-title {
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
    }
    .bh-chat-target-summary-badge {
      margin-left: 0;
      box-shadow: none;
    }
    .bh-chat-target-summary-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }
    .bh-chat-target-summary-meta {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.6;
      color: #64748b;
    }

    /* ====== 全局悬浮气泡通知 ====== */
    .bh-notification {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .bh-notification.show { transform: translateX(-50%) translateY(0); }
    .bh-notification.success { background: rgba(236,253,245,0.95); color: #059669; border: 1px solid #a7f3d0; }
    .bh-notification.error { background: rgba(254,242,242,0.95); color: #dc2626; border: 1px solid #fecaca; }
    .bh-notification.info { background: rgba(239,246,255,0.95); color: #2563eb; border: 1px solid #bfdbfe; }
    .bh-notification.warn { background: rgba(255,251,235,0.95); color: #d97706; border: 1px solid #fde68a; }

    /* ====== 恢复按钮悬浮窗 ====== */
    #boss-helper-restore {
      position: fixed;
      right: 20px;
      top: 80px;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: #0f172a;
      color: white;
      border: none;
      cursor: pointer;
      z-index: 9998;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(15,23,42,0.25);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #boss-helper-restore:hover { transform: scale(1.08); background: #1e293b; }

    /* ====== 模态框重写 ====== */
    .bh-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15,23,42,0.4);
      z-index: 10002;
      display: flex;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(4px);
    }
    .bh-modal {
      background: white;
      border-radius: 16px;
      width: 640px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.2);
    }
    .bh-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #f1f5f9;
    }
    .bh-modal-header h3 { margin: 0; font-size: 16px; color: #0f172a; }
    .bh-modal-close {
      width: 32px; height: 32px;
      border: none; background: #f8fafc;
      border-radius: 8px; cursor: pointer;
      font-size: 20px; color: #64748b;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .bh-modal-close:hover { background: #f1f5f9; color: #0f172a; }
    .bh-modal-body {
      padding: 0;
      flex: 1;
      overflow-y: auto;
    }
    .bh-table { width: 100%; border-collapse: collapse; }
    .bh-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; padding: 12px 24px; text-align: left; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; }
    .bh-table td { padding: 12px 24px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; }
    .bh-table tr:hover td { background: #f8fafc; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
