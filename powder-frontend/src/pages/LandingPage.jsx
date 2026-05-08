import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config';
import { useProjectImport } from '../hooks/useProjectImport';

export default function LandingPage({ onSelectEngagement, onFlowChange }) {
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
      if (onFlowChange) onFlowChange(); // SYNC BRIDGE
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
      if (onFlowChange) onFlowChange(); // SYNC BRIDGE
      setDeleteModal({ isOpen: false, id: null, title: '' });
    } catch (error) { toast.error('Failed to delete.'); }
  };

  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100vh', backgroundColor: '#f8fafc', color: '#334155', fontFamily: 'system-ui, sans-serif', padding: '40px', gap: '40px', position: 'relative' };
  const cardStyle = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' };
  const inputStyle = { width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' };
  const labelStyle = { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#475569' };
  const fieldContainer = { marginBottom: '20px' };
  const listContainerStyle = { backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' };

  const renderDynamicList = (title, list, setter, placeholder) => (
    <div style={listContainerStyle}>
      <label style={labelStyle}>{title}</label>
      {list.map((item, index) => (
        <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input type="text" placeholder={placeholder} value={item} onChange={(e) => handleListChange(setter, index, e.target.value)} style={{...inputStyle, padding: '10px'}} />
          {list.length > 1 && <button type="button" onClick={() => removeListRow(setter, index)} style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', padding: '0 12px', fontWeight: 'bold' }}>X</button>}
        </div>
      ))}
      <button type="button" onClick={() => addListRow(setter)} style={{ backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ Add Another</button>
    </div>
  );

  const renderRolesList = () => (
    <div style={listContainerStyle}>
      <label style={labelStyle}>Roles & Credentials Provided</label>
      {rolesList.map((row, index) => (
        <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input type="text" placeholder="Role" value={row.role} onChange={(e) => handleRoleChange(index, 'role', e.target.value)} style={{...inputStyle, padding: '10px'}} />
          <input type="text" placeholder="Username" value={row.user} onChange={(e) => handleRoleChange(index, 'user', e.target.value)} style={{...inputStyle, padding: '10px'}} />
          <input type="text" placeholder="Password" value={row.password} onChange={(e) => handleRoleChange(index, 'password', e.target.value)} style={{...inputStyle, padding: '10px'}} />
          {rolesList.length > 1 && <button type="button" onClick={() => removeRoleRow(index)} style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', padding: '0 12px', fontWeight: 'bold' }}>X</button>}
        </div>
      ))}
      <button type="button" onClick={addRoleRow} style={{ backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ Add Another Role</button>
    </div>
  );

  return (
    <div style={pageStyle}>
      {deleteModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444', fontSize: '20px' }}>Delete Engagement?</h3>
            <p style={{ color: '#475569', fontSize: '15px', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong>{deleteModal.title}</strong>? All nodes and findings attached to this project will be permanently lost.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '25px' }}>
              <button onClick={() => setDeleteModal({ isOpen: false, id: null, title: '' })} style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, width: '400px', flexShrink: 0 }}>
        <h1 style={{ marginTop: 0, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px', fontSize: '22px' }}>Recent Engagements</h1>

        <input type="file" ref={importFileRef} style={{ display: 'none' }} onChange={handleImportZip} accept=".zip" />
        <button onClick={() => importFileRef.current.click()} style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#0ea5e9', border: '1px dashed #bae6fd', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '20px', transition: 'background-color 0.2s' }}>
          ⬇️ Import Existing Project (ZIP)
        </button>

        {recentEngagements.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No previous engagements found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentEngagements.map(engagement => (
              <div key={engagement.id} onClick={() => onSelectEngagement(engagement.id)} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px', cursor: 'pointer', borderLeft: '4px solid #0ea5e9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, overflow: 'hidden', paddingRight: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#1e293b', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{engagement.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{engagement.meta_tags?.test_type || 'Unknown'}</div>
                </div>
                <button onClick={(e) => triggerDelete(e, engagement.id, engagement.title)} style={{ minWidth: '32px', height: '32px', backgroundColor: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete Engagement">✖</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, width: '100%', maxWidth: '800px', flexGrow: 1 }}>
        <h1 style={{ marginTop: 0, marginBottom: '30px', color: '#0f172a', fontSize: '26px' }}>Start New Engagement</h1>
        <form onSubmit={handleStart}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ ...fieldContainer, flex: 2 }}>
              <label style={labelStyle}>Engagement Name / Title: *</label>
              <input type="text" required value={engagementName} onChange={(e) => setEngagementName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ ...fieldContainer, flex: 1 }}>
              <label style={labelStyle}>Test Type: *</label>
              <select value={testType} onChange={(e) => { setTestType(e.target.value); setFormData({}); setIpsList(['']); setUrlsList(['']); setRolesList([{ role: '', user: '', password: '' }]); }} style={{...inputStyle, fontWeight: '600'}}>
                <option value="Adversary Simulation">Adversary Simulation</option>
                <option value="Black Box">Black Box (External)</option>
                <option value="White Box">White Box (Internal/Code)</option>
              </select>
            </div>
          </div>
          <div style={fieldContainer}>
            <label style={labelStyle}>KeepSecureLink (Vuln Dashboard URL):</label>
            <input type="url" value={keepSecureLink} placeholder="https://..." onChange={(e) => setKeepSecureLink(e.target.value)} style={inputStyle} />
          </div>
          <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: '30px 0' }} />

          {testType === 'Adversary Simulation' && (
            <>
              <div style={fieldContainer}><label style={labelStyle}>Assumed Laptop Name/IP</label><input type="text" name="laptop" onChange={handleInputChange} style={inputStyle} /></div>
              <div style={fieldContainer}><label style={labelStyle}>Compromised Account</label><input type="text" name="account" onChange={handleInputChange} style={inputStyle} /></div>
              <div style={fieldContainer}><label style={labelStyle}>Password / Hash</label><input type="text" name="password" onChange={handleInputChange} style={inputStyle} /></div>
            </>
          )}

          {(testType === 'Black Box' || testType === 'White Box') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {renderDynamicList('Target IPs', ipsList, setIpsList, 'e.g., 192.168.1.1')}
                {renderDynamicList('Target URLs', urlsList, setUrlsList, 'e.g., https://api.acme.com')}
              </div>
              {testType === 'White Box' && <div style={fieldContainer}><label style={labelStyle}>Infrastructure (AWS, GCP, Azure, etc.)</label><input type="text" name="infrastructure" onChange={handleInputChange} style={inputStyle} /></div>}
              {renderRolesList()}
              <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}><input type="checkbox" name="vpn" onChange={handleInputChange} /> VPN Required</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}><input type="checkbox" name="mobile" onChange={handleInputChange} /> Mobile Testing</label>
                {testType === 'White Box' && <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}><input type="checkbox" name="source_code" onChange={handleInputChange} /> Source Code Prov.</label>}
              </div>
              {testType === 'White Box' && formData.source_code && (
                <div style={listContainerStyle}>
                  <div style={fieldContainer}><label style={labelStyle}>Source Code Location</label><input type="text" name="code_location" onChange={handleInputChange} style={inputStyle} /></div>
                  <div style={{marginBottom: 0}}><label style={labelStyle}>Documentation Location</label><input type="text" name="docs_location" onChange={handleInputChange} style={inputStyle} /></div>
                </div>
              )}
              {formData.mobile && (
                <div style={listContainerStyle}>
                  <div style={fieldContainer}><label style={labelStyle}>APK Location (Android)</label><input type="text" name="apk_location" onChange={handleInputChange} style={inputStyle} /></div>
                  <div style={{marginBottom: 0}}><label style={labelStyle}>IPA Location (iOS)</label><input type="text" name="ipa_location" onChange={handleInputChange} style={inputStyle} /></div>
                </div>
              )}
            </>
          )}

          <button type="submit" style={{ width: '100%', padding: '16px', backgroundColor: '#0ea5e9', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '20px', boxShadow: '0 4px 6px -1px rgba(14, 165, 233, 0.4)' }}>
            Launch Engagement
          </button>
        </form>
      </div>
    </div>
  );
}