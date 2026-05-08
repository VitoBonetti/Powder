import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getApiUrl } from '../../config';
import { X, Plus, Edit2, Trash2, Search, Terminal, Folder, Wrench } from 'lucide-react';

export default function ToolsLibraryModal({ isOpen, onClose }) {
  const [tools, setTools] = useState([]);
  const [categories, setCategories] = useState([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingToolId, setEditingToolId] = useState(null);

  const [newCatName, setNewCatName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);

  const initialFormState = { name: '', category_id: '', description: '', install_linux: '', install_windows: '', pentest_notes: '' };
  const [formData, setFormData] = useState(initialFormState);

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const options = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(getApiUrl(endpoint), options);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchTools();
      setIsFormOpen(false);
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try { setCategories(await apiCall('/flow/categories')); }
    catch (err) { toast.error('Failed to load categories'); }
  };

  const fetchTools = async () => {
    try { setTools(await apiCall('/flow/tools')); }
    catch (err) { toast.error('Failed to load tools'); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const newCat = await apiCall('/flow/categories', 'POST', { name: newCatName.trim() });
      setCategories([...categories, newCat]);
      setNewCatName('');
      setIsAddingCat(false);
      toast.success('Category added');
    } catch (err) { toast.error('Failed to add category. Maybe it exists?'); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Delete this category? All tools inside will also be deleted.")) return;
    try {
      await apiCall(`/flow/categories/${id}`, 'DELETE');
      setCategories(categories.filter(c => c.id !== id));
      setTools(tools.filter(t => t.category_id !== id));
      if (selectedCategoryId === id) setSelectedCategoryId('all');
      toast.success('Category deleted');
    } catch (err) { toast.error('Failed to delete category'); }
  };

  const openForm = (tool = null) => {
    if (tool) {
      setFormData(tool);
      setEditingToolId(tool.id);
    } else {
      setFormData({ ...initialFormState, category_id: selectedCategoryId !== 'all' ? selectedCategoryId : '' });
      setEditingToolId(null);
    }
    setIsFormOpen(true);
  };

  const handleSaveTool = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.category_id) {
      toast.error('Name and Category are required');
      return;
    }
    try {
      if (editingToolId) {
        const updated = await apiCall(`/flow/tools/${editingToolId}`, 'PUT', formData);
        setTools(tools.map(t => t.id === editingToolId ? updated : t));
        toast.success('Tool updated');
      } else {
        const created = await apiCall('/flow/tools', 'POST', formData);
        setTools([...tools, created]);
        toast.success('Tool created');
      }
      setIsFormOpen(false);
    } catch (err) { toast.error('Failed to save tool'); }
  };

  const handleDeleteTool = async (id) => {
    if (!window.confirm("Delete this tool?")) return;
    try {
      await apiCall(`/flow/tools/${id}`, 'DELETE');
      setTools(tools.filter(t => t.id !== id));
      toast.success('Tool deleted');
    } catch (err) { toast.error('Failed to delete tool'); }
  };

  const filteredTools = tools.filter(t => {
    const matchesCat = selectedCategoryId === 'all' || t.category_id === selectedCategoryId;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-6 font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3 text-slate-800">
            <div className="p-2 bg-sky-100 text-sky-600 rounded-lg"><Wrench className="w-5 h-5" /></div>
            <h2 className="text-xl font-bold m-0">Pentest Tools Library</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex flex-1 overflow-hidden">

          {/* SIDEBAR: CATEGORIES */}
          <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Categories</h3>
              <button
                onClick={() => { setSelectedCategoryId('all'); setIsFormOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedCategoryId === 'all' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <Folder className="w-4 h-4" /> All Tools
              </button>
            </div>

            <div className="p-2 flex-1 overflow-y-auto space-y-1">
              {categories.map(cat => (
                <div key={cat.id} className={`group flex justify-between items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${selectedCategoryId === cat.id ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-200'}`} onClick={() => { setSelectedCategoryId(cat.id); setIsFormOpen(false); }}>
                  <span className="truncate">{cat.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-100">
              {isAddingCat ? (
                <div className="flex flex-col gap-2">
                  <input autoFocus type="text" placeholder="Category Name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500" onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
                  <div className="flex gap-2">
                    <button onClick={handleAddCategory} className="flex-1 bg-slate-800 text-white text-xs font-bold py-1.5 rounded hover:bg-slate-700">Save</button>
                    <button onClick={() => setIsAddingCat(false)} className="flex-1 bg-white border border-slate-300 text-slate-600 text-xs font-bold py-1.5 rounded hover:bg-slate-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setIsAddingCat(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded-lg text-sm font-semibold hover:border-slate-400 hover:text-slate-700 transition-colors">
                  <Plus className="w-4 h-4" /> Add Category
                </button>
              )}
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 bg-white flex flex-col overflow-hidden relative">

            {/* SUB-HEADER: Search & Add Button */}
            {!isFormOpen && (
              <div className="p-6 pb-2 flex justify-between items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search tools..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-colors" />
                </div>
                <button onClick={() => openForm()} className="flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-sky-600 transition-colors">
                  <Plus className="w-4 h-4" /> Add New Tool
                </button>
              </div>
            )}

            {/* CONTENT SCROLL AREA */}
            <div className="flex-1 overflow-y-auto p-6">
              {isFormOpen ? (
                // --- FORM VIEW ---
                <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">{editingToolId ? 'Edit Tool' : 'Add New Tool'}</h3>
                    <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-semibold">Cancel</button>
                  </div>
                  <form onSubmit={handleSaveTool} className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tool Name *</label>
                        <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category *</label>
                        <select required value={formData.category_id} onChange={(e) => setFormData({...formData, category_id: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500">
                          <option value="" disabled>Select a Category...</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                      <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} rows="2" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Install Command (Linux)</label>
                        <textarea value={formData.install_linux} onChange={(e) => setFormData({...formData, install_linux: e.target.value})} rows="2" className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Install Command (Windows)</label>
                        <textarea value={formData.install_windows} onChange={(e) => setFormData({...formData, install_windows: e.target.value})} rows="2" className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Pentest Notes & Cheatsheet (Markdown)</label>
                      <textarea value={formData.pentest_notes} onChange={(e) => setFormData({...formData, pentest_notes: e.target.value})} rows="6" className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                      <button type="button" onClick={() => setIsFormOpen(false)} className="px-5 py-2 text-sm font-bold text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50">Cancel</button>
                      <button type="submit" className="px-5 py-2 text-sm font-bold text-white bg-sky-500 rounded-md hover:bg-sky-600 shadow-sm">Save Tool</button>
                    </div>
                  </form>
                </div>
              ) : (
                // --- GRID VIEW ---
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                  {filteredTools.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-slate-400">
                      <Wrench className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No tools found in this category.</p>
                    </div>
                  ) : (
                    filteredTools.map(tool => (
                      <div key={tool.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">

                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                          <div>
                            <h3 className="font-bold text-lg text-slate-800">{tool.name}</h3>
                            <span className="inline-block px-2 py-0.5 mt-1 bg-slate-200 text-slate-600 text-xs rounded font-medium">
                              {categories.find(c => c.id === tool.category_id)?.name || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openForm(tool)} className="p-1.5 text-sky-500 hover:bg-sky-100 rounded transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteTool(tool.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>

                        <div className="p-5 space-y-4">
                          {tool.description && <p className="text-sm text-slate-600">{tool.description}</p>}

                          {(tool.install_linux || tool.install_windows) && (
                            <div className="grid grid-cols-1 gap-3">
                              {tool.install_linux && (
                                <div className="bg-slate-900 rounded-md p-3">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Terminal className="w-3 h-3" /> Linux Install</div>
                                  <code className="text-sm text-emerald-400 font-mono break-all">{tool.install_linux}</code>
                                </div>
                              )}
                              {tool.install_windows && (
                                <div className="bg-slate-900 rounded-md p-3">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Terminal className="w-3 h-3" /> Windows Install</div>
                                  <code className="text-sm text-sky-400 font-mono break-all">{tool.install_windows}</code>
                                </div>
                              )}
                            </div>
                          )}

                          {tool.pentest_notes && (
                            <div className="bg-amber-50/50 border border-amber-200/60 rounded-md p-4">
                              <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Execution Notes</h4>
                              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono">{tool.pentest_notes}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}