import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import MDEditor from '@uiw/react-md-editor';
import { getApiUrl } from '../../config';

export default function ResultDrawer({ selectedNode, onClose, onUpdateNode, onDeleteNode, onExportNode }) {
  const [formData, setFormData] = useState({
    title: '', command: '', status: 'action', markdown_result: '', meta_tags: {}
  });

  const scanInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const prevNodeId = useRef(null);

  // Native fetch wrapper
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

  useEffect(() => {
    if (selectedNode && selectedNode.id !== prevNodeId.current) {
      setFormData({
        title: selectedNode.data.title || '',
        command: selectedNode.data.command || '',
        status: selectedNode.data.status || 'action',
        markdown_result: selectedNode.data.markdown_result || '',
        meta_tags: selectedNode.data.meta_tags || {}
      });
      setIsDirty(false);
      prevNodeId.current = selectedNode.id;
    }
  }, [selectedNode]);

  // Debounced Autosave
  useEffect(() => {
    if (!isDirty || !selectedNode) return;
    const timerId = setTimeout(async () => {
      try {
        const data = await apiCall(`/flow/nodes/${selectedNode.id}`, 'PUT', {
           ...formData,
           type: selectedNode.type,
           position_x: selectedNode.position.x,
           position_y: selectedNode.position.y,
        });
        onUpdateNode(selectedNode.id, data);
        setIsDirty(false);
      } catch (error) { console.error("Autosave failed", error); }
    }, 1000);
    return () => clearTimeout(timerId);
  }, [formData, isDirty, selectedNode, onUpdateNode]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
    setIsDirty(true);
  };

  const handleMetaChange = (key, value) => {
    setFormData(prev => ({ ...prev, meta_tags: { ...prev.meta_tags, [key]: value } }));
    setIsDirty(true);
  };

  const handleCredentialChange = (index, field, value) => {
    const newCreds = [...(formData.meta_tags.roles_credentials || [])];
    newCreds[index] = { ...newCreds[index], [field]: value };
    handleMetaChange('roles_credentials', newCreds);
  };

  const addCredential = () => {
    const newCreds = [...(formData.meta_tags.roles_credentials || []), { role: '', user: '', password: '' }];
    handleMetaChange('roles_credentials', newCreds);
  };

  const removeCredential = (index) => {
    const newCreds = (formData.meta_tags.roles_credentials || []).filter((_, i) => i !== index);
    handleMetaChange('roles_credentials', newCreds);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data = await apiCall(`/flow/nodes/${selectedNode.id}`, 'PUT', {
        ...formData, type: selectedNode.type, position_x: selectedNode.position.x, position_y: selectedNode.position.y
      });
      onUpdateNode(selectedNode.id, data);
      toast.success('Saved successfully');
      setIsDirty(false);
    } catch (error) { toast.error('Failed to save'); }
    finally { setIsSaving(false); }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const uploadData = new FormData();
    uploadData.append('file', file);
    const toastId = toast.loading('Uploading image...');
    try {
      const res = await fetch(getApiUrl('/flow/upload/'), { method: 'POST', body: uploadData, credentials: 'include' });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      const imageUrl = data.url;
      const imageMarkdown = `\n\n![Evidence Attachment](${imageUrl})\n\n`;
      let newText = formData.markdown_result + imageMarkdown;
      setFormData(prev => ({ ...prev, markdown_result: newText }));
      setIsDirty(true);
      toast.success('Image attached!', { id: toastId });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) { toast.error('Upload failed', { id: toastId }); }
  };

  const handleScanUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const uploadData = new FormData();
    uploadData.append('file', file);
    const toastId = toast.loading('Parsing scan file...');
    try {
      const res = await fetch(getApiUrl(`/flow/nodes/${selectedNode.id}/parse`), { method: 'POST', body: uploadData, credentials: 'include' });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();

      setFormData(prev => ({
        ...prev,
        markdown_result: data.markdown_result,
        title: data.title || prev.title,
        command: data.command || prev.command
      }));

      onUpdateNode(selectedNode.id, {
        title: data.title, command: data.command, status: formData.status,
        markdown_result: data.markdown_result, meta_tags: formData.meta_tags
      });
      toast.success('Scan parsed successfully!', { id: toastId });
      if (scanInputRef.current) scanInputRef.current.value = '';
    } catch (err) { toast.error('Failed to parse file', { id: toastId }); }
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`, { icon: '📋' });
  };

  if (!selectedNode) return null;
  const isTrigger = selectedNode.type === 'triggerNode';

  // --- STYLES ---
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', marginBottom: '12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '12px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const btnStyle = { backgroundColor: '#ffffff', color: '#0ea5e9', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', transition: 'background-color 0.2s' };
  const cardStyle = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' };
  const sectionHeaderStyle = { fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '16px', paddingLeft: '8px', borderLeft: '3px solid #0ea5e9', lineHeight: '1' };
  const tagStyle = { background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#334155', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' };
  const copyBtnStyle = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '2px', fontSize: '14px' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end', fontFamily: 'system-ui, sans-serif' }} onClick={() => { prevNodeId.current = null; onClose(); }}>
      <div style={{ width: '90vw', maxWidth: '1200px', height: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 25px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '800' }}>{isTrigger ? 'Engagement Scope' : 'Action Node'}</h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{isTrigger ? formData.meta_tags.test_type : 'Edit execution details and findings'}</span>
          </div>
          <button onClick={() => { prevNodeId.current = null; onClose(); }} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '4px' }}>✕</button>
        </div>

        {/* MAIN LAYOUT */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* LEFT COLUMN: Organized Cards */}
          <div style={{ width: '420px', padding: '20px', overflowY: 'auto', borderRight: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            {/* GENERAL CARD */}
            <div style={cardStyle}>
              <div style={sectionHeaderStyle}>General Information</div>
              <label style={labelStyle}>{isTrigger ? 'Engagement Name' : 'Title'}</label>
              <input style={{...inputStyle, fontWeight: '600', fontSize: '14px', marginBottom: isTrigger ? '16px' : '12px'}} name="title" value={formData.title} onChange={handleChange} />
              <label style={labelStyle}>Pentest Phase</label>
              <select style={{...inputStyle, fontWeight: '600', marginBottom: isTrigger ? '12px' : '12px'}} value={formData.meta_tags.category || (isTrigger ? 'Planning' : 'Reconnaissance')} onChange={(e) => handleMetaChange('category', e.target.value)} disabled={isTrigger}>
                <option value="Planning">Planning & Scoping</option>
                <option value="Reconnaissance">Reconnaissance</option>
                <option value="Enumeration">Enumeration</option>
                <option value="Exploitation">Exploitation</option>
                <option value="Post-Exploitation">Post-Exploitation</option>
                <option value="Reporting">Reporting</option>
              </select>
              {isTrigger && (
                <div style={{ marginBottom: '4px' }}>
                  <label style={labelStyle}>KeepSecureLink (Dashboard URL)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input style={{...inputStyle, fontWeight: '500', marginBottom: 0, flex: 1}} value={formData.meta_tags.keep_secure_link || ''} onChange={(e) => handleMetaChange('keep_secure_link', e.target.value)} placeholder="https://..." />
                    {formData.meta_tags.keep_secure_link && (
                      <>
                        <a href={formData.meta_tags.keep_secure_link.startsWith('http') ? formData.meta_tags.keep_secure_link : `https://${formData.meta_tags.keep_secure_link}`} target="_blank" rel="noopener noreferrer" style={{...btnStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', padding: '0 12px'}} title="Open Link">↗</a>
                        <button onClick={() => handleCopy(formData.meta_tags.keep_secure_link, 'KeepSecureLink')} style={{...btnStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px'}} title="Copy Link">⎘</button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {!isTrigger && (
                <>
                  <label style={labelStyle}>Status Indicator</label>
                  <select style={{...inputStyle, fontWeight: '600', marginBottom: 0}} name="status" value={formData.status} onChange={handleChange}>
                    <option value="action">Action (Scan / Investigate)</option>
                    <option value="path">Attack Path (Moving Forward)</option>
                    <option value="rabbit_hole">Rabbit Hole (Dead End)</option>
                    <option value="vulnerability">Vulnerability (Finding)</option>
                  </select>
                </>
              )}
            </div>

            {/* TRIGGER NODE */}
            {isTrigger && (
              <>
                <div style={cardStyle}>
                  <div style={sectionHeaderStyle}>Target Infrastructure</div>
                  {(formData.meta_tags.vpn || formData.meta_tags.infrastructure) && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      {formData.meta_tags.vpn && <span style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', border: '1px solid #fecaca' }}>VPN REQUIRED</span>}
                      {formData.meta_tags.infrastructure && <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', border: '1px solid #bae6fd' }}>INFRA: {formData.meta_tags.infrastructure}</span>}
                    </div>
                  )}
                  {formData.meta_tags.urls && formData.meta_tags.urls.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={labelStyle}>Target URLs</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {formData.meta_tags.urls.map((url, i) => (
                          <div key={i} style={tagStyle}><a href={url.startsWith('http') ? url : `http://${url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: '600' }}>{url}</a><button onClick={() => handleCopy(url, 'URL')} style={copyBtnStyle}>⎘</button></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {formData.meta_tags.ips && formData.meta_tags.ips.length > 0 && (
                    <div>
                      <label style={labelStyle}>Target IPs</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {formData.meta_tags.ips.map((ip, i) => (
                          <div key={i} style={tagStyle}><span style={{ fontWeight: '500' }}>{ip}</span><button onClick={() => handleCopy(ip, 'IP')} style={copyBtnStyle}>⎘</button></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {(formData.meta_tags.source_code || formData.meta_tags.mobile) && (
                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>Provided Assets</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {formData.meta_tags.code_location && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><a href={formData.meta_tags.code_location} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a', fontSize: '13px', textDecoration: 'none', fontWeight: '600' }}>↗ Code Repository</a><button onClick={() => handleCopy(formData.meta_tags.code_location, 'Code Link')} style={copyBtnStyle}>⎘</button></div>}
                      {formData.meta_tags.docs_location && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><a href={formData.meta_tags.docs_location} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a', fontSize: '13px', textDecoration: 'none', fontWeight: '600' }}>↗ Documentation</a><button onClick={() => handleCopy(formData.meta_tags.docs_location, 'Docs Link')} style={copyBtnStyle}>⎘</button></div>}
                      {formData.meta_tags.apk_location && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><a href={formData.meta_tags.apk_location} target="_blank" rel="noopener noreferrer" style={{ color: '#d97706', fontSize: '13px', textDecoration: 'none', fontWeight: '600' }}>↗ Android (APK)</a><button onClick={() => handleCopy(formData.meta_tags.apk_location, 'APK Link')} style={copyBtnStyle}>⎘</button></div>}
                      {formData.meta_tags.ipa_location && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><a href={formData.meta_tags.ipa_location} target="_blank" rel="noopener noreferrer" style={{ color: '#d97706', fontSize: '13px', textDecoration: 'none', fontWeight: '600' }}>↗ iOS (IPA)</a><button onClick={() => handleCopy(formData.meta_tags.ipa_location, 'IPA Link')} style={copyBtnStyle}>⎘</button></div>}
                    </div>
                  </div>
                )}
                <div style={cardStyle}>
                  <div style={{...sectionHeaderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><span>Credentials & Roles</span><span style={{fontSize: '11px', fontWeight: '500', color: '#94a3b8', borderLeft: 'none', paddingLeft: 0}}>{(formData.meta_tags.roles_credentials || []).length} sets</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(formData.meta_tags.roles_credentials || []).map((rc, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1.5fr auto auto', gap: '6px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
                        <input style={{...inputStyle, marginBottom: 0, padding: '8px', background: '#ffffff'}} placeholder="Role" value={rc.role || ''} onChange={(e) => handleCredentialChange(idx, 'role', e.target.value)} />
                        <input style={{...inputStyle, marginBottom: 0, padding: '8px', background: '#ffffff'}} placeholder="Username" value={rc.user || ''} onChange={(e) => handleCredentialChange(idx, 'user', e.target.value)} />
                        <input style={{...inputStyle, marginBottom: 0, padding: '8px', background: '#ffffff'}} placeholder="Password" value={rc.password || ''} onChange={(e) => handleCredentialChange(idx, 'password', e.target.value)} />
                        <button onClick={() => handleCopy(`${rc.user}:${rc.password}`, 'Credentials')} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '6px', cursor: 'pointer', height: '34px', width: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>⎘</button>
                        <button onClick={() => removeCredential(idx)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', height: '34px', width: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={addCredential} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', marginTop: '8px', fontWeight: '600', width: '100%', transition: 'background-color 0.2s' }}>+ Add New Credential</button>
                </div>
              </>
            )}

            {/* ACTION NODE */}
            {!isTrigger && (
              <>
                <div style={cardStyle}>
                  <div style={sectionHeaderStyle}>Execution Details</div>
                  <label style={labelStyle}>Command / Payload Used</label>
                  <textarea style={{...inputStyle, height: '90px', resize: 'vertical', fontFamily: 'monospace', marginBottom: 0}} name="command" placeholder="$ nmap -sC -sV ..." value={formData.command} onChange={handleChange} />
                </div>
                <div style={{...cardStyle, borderColor: formData.status === 'vulnerability' ? '#fca5a5' : '#e2e8f0', background: formData.status === 'vulnerability' ? '#fef2f2' : '#ffffff'}}>
                  <div style={{...sectionHeaderStyle, borderLeftColor: formData.status === 'vulnerability' ? '#ef4444' : '#0ea5e9'}}>Reporting & Vulnerability</div>
                  <label style={labelStyle}>Severity Level</label>
                  <select style={{...inputStyle, background: '#ffffff'}} value={formData.meta_tags.severity || ''} onChange={(e) => handleMetaChange('severity', e.target.value)}>
                    <option value="">None / Unrated</option>
                    <option value="info">Info</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#334155', fontSize: '13px', fontWeight: '600', marginTop: '8px', padding: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <input type="checkbox" checked={formData.meta_tags.published || false} onChange={(e) => handleMetaChange('published', e.target.checked)} style={{ marginRight: '10px', width: '16px', height: '16px', accentColor: '#0ea5e9' }} />
                    Include in Final Report
                  </label>
                </div>
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Markdown Editor */}
          <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>{isTrigger ? 'General Notes' : 'Terminal Output & Evidence'}</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Supports standard Markdown format</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} accept="image/*" />
                <button onClick={() => fileInputRef.current.click()} style={btnStyle}>Attach Image</button>

                <input type="file" ref={scanInputRef} style={{ display: 'none' }} onChange={handleScanUpload} accept=".xml,.txt,.json" />
                <button onClick={() => scanInputRef.current.click()} style={{ backgroundColor: '#0ea5e9', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', marginLeft: '10px', boxShadow: '0 2px 4px rgba(14,165,233,0.2)' }}>
                  Auto-Parse File
                </button>
              </div>
            </div>
            <div data-color-mode="light" style={{ flex: 1, overflow: 'hidden' }}>
              <MDEditor value={formData.markdown_result} onChange={(val) => { setFormData(prev => ({ ...prev, markdown_result: val || '' })); setIsDirty(true); }} height="100%" preview="edit" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: 'none' }} />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
          {isSaving && <span style={{ fontSize: '12px', color: '#64748b', marginRight: 'auto' }}>Saving changes...</span>}
          {!isTrigger && <button onClick={() => onDeleteNode(selectedNode.id)} style={{ padding: '10px 20px', backgroundColor: '#ffffff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', marginRight: 'auto' }}>Delete Node</button>}
          <button onClick={() => onExportNode(selectedNode.id, formData.title)} style={{ padding: '10px 20px', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>Export PDF</button>
          <button onClick={() => { prevNodeId.current = null; onClose(); }} style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Close</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '10px 24px', backgroundColor: '#0ea5e9', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', boxShadow: '0 2px 4px rgba(14,165,233,0.3)' }}>Manual Save</button>
        </div>
      </div>
    </div>
  );
}