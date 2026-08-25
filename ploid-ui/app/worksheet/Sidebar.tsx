export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">P</span>
        <span>Ploid</span>
        <span className="brand-chevron">⌄</span>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switcher">
        <span className="workspace-dot">N</span>
        <span>Northstar</span>
        <span className="more">•••</span>
      </div>
      <nav className="main-nav">
        <button>
          <span>⌂</span> Overview
        </button>
        <button className="nav-active">
          <span>▦</span> Data
        </button>
        <button>
          <span>◌</span> Automations
        </button>
        <button>
          <span>◈</span> Integrations
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button>
          <span>⚙</span> Settings
        </button>
        <button>
          <span>?</span> Help center
        </button>
        <div className="user-chip">
          <span className="avatar small">MP</span>
          <span>Maya Patel</span>
          <span className="more">•••</span>
        </div>
      </div>
    </aside>
  );
}
