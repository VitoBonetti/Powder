import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config';
import { useProjectImport } from '../hooks/useProjectImport';

export default function LandingPage({ onSelectEngagement, onFlowChange, theme }) {
  const [recentEngagements, setRecentEngagements] = useState([]);
  const [engagementName, setEngagementName] = useState('');
  const [testType, setTestType] = useState('Adversary Simulation');
  const [keepSecureLink, setKeepSecureLink] = useState('');
  const [formData, setFormData] = useState({});

  const [rolesList, setRolesList] = useState([{ role: '', user: '', password: '' }]);
  const [ipsList, setIpsList] = useState(['']);
  const [urlsList, setUrlsList] = useState(['']);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, title: '' });

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const options = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(getApiUrl(endpoint), options);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  };

  const { importFileRef, handleImportZip } = useProjectImport(() => {
    fetchEngagements();
    if (onFlowChange) onFlowChange();
  });

  const fetchEngagements = () => {
    apiCall('/flow/nodes')
      .then(data => {
        const triggers = data.filter(node => node.type === 'triggerNode');
        triggers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setRecentEngagements(triggers);
      })
      .catch(err => console.error("Could not load recent engagements:", err));
  };

  useEffect(() => { fetchEngagements(); }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleListChange = (setter, index, value) => setter(prev => { const newArr = [...prev]; newArr[index] = value; return newArr; });
  const addListRow = (setter) => setter(prev => [...prev, '']);
  const removeListRow = (setter, index) => setter(prev => prev.filter((_, i) => i !== index));

  const handleRoleChange = (index, field, value) => {
    const newRoles = [...rolesList]; newRoles[index][field] = value; setRolesList(newRoles);
  };
  const addRoleRow = () => setRolesList([...rolesList, { role: '', user: '', password: '' }]);
  const removeRoleRow = (index) => setRolesList(rolesList.filter((_, i) => i !== index));

  const handleStart = async (e) => {
    e.preventDefault();
    try {
      const response = await apiCall('/flow/nodes', 'POST', {
        title: engagementName,
        type: 'triggerNode',
        command: `Scope: ${testType}`,
        status: 'success',
        position_x: 100,
        position_y: 250,
        meta_tags: {
          test_type: testType,
          keep_secure_link: keepSecureLink,
          ...(testType !== 'Adversary Simulation' && {
            ips: ipsList.filter(ip => ip.trim() !== ''),
            urls: urlsList.filter(url => url.trim() !== ''),
            roles_credentials: rolesList.filter(r => r.role || r.user || r.password)
          }),
          ...formData
        }
      });
      toast.success('Engagement created!');
      if (onFlowChange) onFlowChange();
      onSelectEngagement(response.id);
    } catch (error) { toast.error('Failed to create engagement.'); }
  };

  const triggerDelete = (e, id, title) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, id, title });
  };

  const confirmDelete = async () => {
    try {
      await apiCall(`/flow/nodes/${deleteModal.id}`, 'DELETE');
      setRecentEngagements(prev => prev.filter(eng => eng.id !== deleteModal.id));
      toast.success('Engagement deleted');
      if (onFlowChange) onFlowChange();
      setDeleteModal({ isOpen: false, id: null, title: '' });
    } catch (error) { toast.error('Failed to delete.'); }
  };

  // --- Reusable Tailwind Classes ---
  const inputClass = "w-full p-3 rounded-md border border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-blue-500 transition-colors";
  const labelClass = "block mb-2 text-sm font-semibold text-slate-600 dark:text-gray-400";
  const listContainerClass = "bg-slate-100 dark:bg-gray-800/50 p-4 rounded-lg mb-5 border border-slate-200 dark:border-gray-700 transition-colors";

  const renderDynamicList = (title, list, setter, placeholder) => (
    <div className={listContainerClass}>
      <label className={labelClass}>{title}</label>
      {list.map((item, index) => (
        <div key={index} className="flex gap-2 mb-2.5">
          <input type="text" placeholder={placeholder} value={item} onChange={(e) => handleListChange(setter, index, e.target.value)} className={inputClass} />
          {list.length > 1 && (
            <button type="button" onClick={() => removeListRow(setter, index)} className="bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-md px-3 font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">X</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => addListRow(setter)} className="bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border-none rounded-md px-4 py-2 text-sm font-semibold hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">+ Add Another</button>
    </div>
  );

  const renderRolesList = () => (
    <div className={listContainerClass}>
      <label className={labelClass}>Roles & Credentials Provided</label>
      {rolesList.map((row, index) => (
        <div key={index} className="flex gap-2 mb-2.5">
          <input type="text" placeholder="Role" value={row.role} onChange={(e) => handleRoleChange(index, 'role', e.target.value)} className={inputClass} />
          <input type="text" placeholder="Username" value={row.user} onChange={(e) => handleRoleChange(index, 'user', e.target.value)} className={inputClass} />
          <input type="text" placeholder="Password" value={row.password} onChange={(e) => handleRoleChange(index, 'password', e.target.value)} className={inputClass} />
          {rolesList.length > 1 && (
            <button type="button" onClick={() => removeRoleRow(index)} className="bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-md px-3 font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">X</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRoleRow} className="bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border-none rounded-md px-4 py-2 text-sm font-semibold hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">+ Add Another Role</button>
    </div>
  );

  return (
    <div className="min-h-screen flex justify-center items-start bg-slate-50 dark:bg-[#0d1117] text-slate-800 dark:text-gray-200 p-10 gap-10 font-sans transition-colors duration-200">

      {/* DELETE MODAL */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 flex justify-center items-center z-[1000] backdrop-blur-sm">
          <div className="bg-white dark:bg-[#161b22] p-8 rounded-xl w-[400px] shadow-2xl border border-transparent dark:border-gray-800">
            <h3 className="mt-0 text-red-500 dark:text-red-400 text-xl font-bold mb-3">Delete Engagement?</h3>
            <p className="text-slate-600 dark:text-gray-400 text-sm leading-relaxed mb-6">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{deleteModal.title}</strong>? All nodes and findings attached to this project will be permanently lost.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteModal({ isOpen: false, id: null, title: '' })} className="px-4 py-2 rounded-md border border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-300 font-semibold hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-bold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT COLUMN: RECENT ENGAGEMENTS */}
      <div className="bg-white dark:bg-[#161b22] p-8 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm w-[400px] shrink-0 transition-colors">
        <h1 className="mt-0 text-slate-900 dark:text-white border-b-2 border-slate-200 dark:border-gray-800 pb-4 text-2xl font-bold mb-6">Recent Engagements</h1>

        <input type="file" ref={importFileRef} className="hidden" onChange={handleImportZip} accept=".zip" />
        <button onClick={() => importFileRef.current.click()} className="w-full bg-sky-50 dark:bg-blue-900/20 text-sky-600 dark:text-blue-400 border border-dashed border-sky-200 dark:border-blue-800/50 p-3 rounded-lg font-bold cursor-pointer mb-6 hover:bg-sky-100 dark:hover:bg-blue-900/40 transition-colors">
          ⬇️ Import Existing Project (ZIP)
        </button>

        {recentEngagements.length === 0 ? (
          <p className="text-slate-500 dark:text-gray-500 text-sm text-center mt-10">No previous engagements found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recentEngagements.map(engagement => (
              <div key={engagement.id} onClick={() => onSelectEngagement(engagement.id)} className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-gray-700 p-4 rounded-lg cursor-pointer border-l-4 border-l-sky-500 dark:border-l-blue-500 flex justify-between items-center hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors group">
                <div className="flex-1 overflow-hidden pr-3">
                  <div className="font-bold text-[15px] text-slate-900 dark:text-gray-200 mb-1 truncate">{engagement.title}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 font-medium">{engagement.meta_tags?.test_type || 'Unknown'}</div>
                </div>
                <button onClick={(e) => triggerDelete(e, engagement.id, engagement.title)} className="w-8 h-8 flex items-center justify-center bg-transparent border-none text-red-400 dark:text-red-500 text-lg cursor-pointer rounded-md opacity-50 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all" title="Delete Engagement">✖</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: NEW ENGAGEMENT FORM */}
      <div className="bg-white dark:bg-[#161b22] p-8 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm w-full max-w-[800px] grow transition-colors">
        <h1 className="mt-0 mb-8 text-slate-900 dark:text-white text-[26px] font-bold">Start New Engagement</h1>
        <form onSubmit={handleStart}>
          <div className="flex gap-5 mb-5">
            <div className="flex-[2]">
              <label className={labelClass}>Engagement Name / Title: *</label>
              <input type="text" required value={engagementName} onChange={(e) => setEngagementName(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Test Type: *</label>
              <select value={testType} onChange={(e) => { setTestType(e.target.value); setFormData({}); setIpsList(['']); setUrlsList(['']); setRolesList([{ role: '', user: '', password: '' }]); }} className={`${inputClass} font-semibold`}>
                <option value="Adversary Simulation">Adversary Simulation</option>
                <option value="Black Box">Black Box (External)</option>
                <option value="White Box">White Box (Internal/Code)</option>
              </select>
            </div>
          </div>
          <div className="mb-5">
            <label className={labelClass}>KeepSecureLink (Vuln Dashboard URL):</label>
            <input type="url" value={keepSecureLink} placeholder="https://..." onChange={(e) => setKeepSecureLink(e.target.value)} className={inputClass} />
          </div>

          <hr className="border-none border-t-2 border-slate-100 dark:border-gray-800 my-8" />

          {testType === 'Adversary Simulation' && (
            <>
              <div className="mb-5"><label className={labelClass}>Assumed Laptop Name/IP</label><input type="text" name="laptop" onChange={handleInputChange} className={inputClass} /></div>
              <div className="mb-5"><label className={labelClass}>Compromised Account</label><input type="text" name="account" onChange={handleInputChange} className={inputClass} /></div>
              <div className="mb-5"><label className={labelClass}>Password / Hash</label><input type="text" name="password" onChange={handleInputChange} className={inputClass} /></div>
            </>
          )}

          {(testType === 'Black Box' || testType === 'White Box') && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                {renderDynamicList('Target IPs', ipsList, setIpsList, 'e.g., 192.168.1.1')}
                {renderDynamicList('Target URLs', urlsList, setUrlsList, 'e.g., https://api.acme.com')}
              </div>
              {testType === 'White Box' && <div className="mb-5"><label className={labelClass}>Infrastructure (AWS, GCP, Azure, etc.)</label><input type="text" name="infrastructure" onChange={handleInputChange} className={inputClass} /></div>}

              {renderRolesList()}

              <div className="flex gap-6 mb-5 p-4 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-gray-300 text-sm"><input type="checkbox" name="vpn" onChange={handleInputChange} className="w-4 h-4 accent-sky-500 dark:accent-blue-500" /> VPN Required</label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-gray-300 text-sm"><input type="checkbox" name="mobile" onChange={handleInputChange} className="w-4 h-4 accent-sky-500 dark:accent-blue-500" /> Mobile Testing</label>
                {testType === 'White Box' && <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-gray-300 text-sm"><input type="checkbox" name="source_code" onChange={handleInputChange} className="w-4 h-4 accent-sky-500 dark:accent-blue-500" /> Source Code Prov.</label>}
              </div>

              {testType === 'White Box' && formData.source_code && (
                <div className={listContainerClass}>
                  <div className="mb-4"><label className={labelClass}>Source Code Location</label><input type="text" name="code_location" onChange={handleInputChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Documentation Location</label><input type="text" name="docs_location" onChange={handleInputChange} className={inputClass} /></div>
                </div>
              )}

              {formData.mobile && (
                <div className={listContainerClass}>
                  <div className="mb-4"><label className={labelClass}>APK Location (Android)</label><input type="text" name="apk_location" onChange={handleInputChange} className={inputClass} /></div>
                  <div><label className={labelClass}>IPA Location (iOS)</label><input type="text" name="ipa_location" onChange={handleInputChange} className={inputClass} /></div>
                </div>
              )}
            </>
          )}

          <button type="submit" className="w-full p-4 bg-sky-500 hover:bg-sky-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-none rounded-lg cursor-pointer font-bold text-base mt-5 shadow-sm transition-colors">
            Launch Engagement
          </button>
        </form>
      </div>
    </div>
  );
}