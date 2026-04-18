import { Book, Search, ChevronRight, FileText, Keyboard, Command, HelpCircle } from 'lucide-react';

export default function DocsPage() {
  const docCategories = [
    { title: 'Analysis Methods', icon: Book, items: ['Steiner Analysis', 'Tweed Analysis', 'McNamara Analysis', 'Jarabak Model'] },
    { title: 'Platform Basics', icon: HelpCircle, items: ['Patient Management', 'Uploading X-Rays', 'Calibrating Images', 'Managing Reports'] },
    { title: 'AI Engine', icon: Command, items: ['Auto-Tracing Accuracy', 'Landmark Confidence', 'Refinement Tools'] },
  ];

  return (
    <div className="docs-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        .docs-wrapper { padding: 40px; max-width: 1100px; margin: 0 auto; }
        .docs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 48px; }
        .docs-header h1 { font-size: 2.25rem; font-weight: 800; color: var(--color-text-primary); }
        
        .docs-search {
          display: flex; align-items: center; gap: 12px; background: var(--color-bg-secondary);
          border: 1px solid var(--color-border); padding: 12px 20px; border-radius: 16px; width: 400px;
        }
        .docs-search input { background: transparent; border: none; color: var(--color-text-primary); outline: none; flex: 1; }
        
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32px; margin-bottom: 64px; }
        .category-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 24px; box-shadow: var(--shadow-card);
        }
        .cat-title { font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; color: var(--color-primary); }
        
        .doc-link {
          display: flex; align-items: center; justify-content: space-between; padding: 12px;
          border-radius: 12px; color: var(--color-text-secondary); text-decoration: none;
          transition: 0.2s; cursor: pointer;
        }
        .doc-link:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); }
        
        .shortcut-banner {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
          border: 1px solid var(--color-border); border-radius: 24px; padding: 32px;
          display: flex; align-items: center; gap: 32px;
        }
        .kbd-wrap { display: flex; gap: 8px; }
        kbd {
          background: var(--color-bg-card); border: 1px solid var(--color-border);
          padding: 4px 10px; border-radius: 6px; font-weight: 700; font-family: monospace;
          box-shadow: 0 4px 0 var(--color-border);
        }
      `}} />

      <header className="docs-header">
        <div>
          <h1>Documentation</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Master the AI Cephalometric Analysis platform.</p>
        </div>
        <div className="docs-search">
          <Search size={18} color="var(--color-text-muted)" />
          <input type="text" placeholder="Search for models, guides..." />
        </div>
      </header>

      <div className="docs-grid">
        {docCategories.map(cat => (
          <div key={cat.title} className="category-card">
            <h2 className="cat-title"><cat.icon size={20} /> {cat.title}</h2>
            <div className="doc-links">
              {cat.items.map(item => (
                <div key={item} className="doc-link">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileText size={16} />
                    <span>{item}</span>
                  </div>
                  <ChevronRight size={14} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="shortcut-banner">
        <Keyboard size={48} color="var(--color-primary)" />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>Keyboard Shortcuts</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Efficiency for expert clinicians in the X-Ray Analysis View.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem' }}>Select Next Landmark</span>
            <kbd>TAB</kbd>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem' }}>Toggle Tracing Line</span>
            <kbd>L</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
