import { useState, useEffect, useCallback, useRef } from 'react';
import { getFolders, createFolder, getFiles, getUploadUrl, getDownloadUrl, getUsers } from '../lib/api';
import { getFileIcon, formatSize, timeAgo } from '../lib/helpers';
import { useToast } from '../components/Toast';
import EmptyState from '../components/EmptyState';

function buildTree(folders) {
  const nodeMap = {};
  folders.forEach(f => { nodeMap[f.folderId] = { ...f, children: [] }; });
  const roots = [];
  folders.forEach(f => {
    const parts = (f.path || '/').split('/').filter(Boolean);
    if (parts.length <= 1) {
      roots.push(nodeMap[f.folderId]);
    } else if (f.parentFolderId && nodeMap[f.parentFolderId]) {
      nodeMap[f.parentFolderId].children.push(nodeMap[f.folderId]);
    } else {
      roots.push(nodeMap[f.folderId]);
    }
  });
  return roots;
}

function FolderTree({ nodes, depth, currentFolderId, onSelect }) {
  return nodes.map(node => (
    <div key={node.folderId}>
      <div
        className={`folder-item${node.folderId === currentFolderId ? ' active' : ''}`}
        style={{ paddingLeft: `${0.4 + depth}rem` }}
        onClick={() => onSelect(node.folderId)}
      >
        <span className="folder-item-icon">{node.children.length ? '📂' : '📁'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
      {node.children.length > 0 && <FolderTree nodes={node.children} depth={depth + 1} currentFolderId={currentFolderId} onSelect={onSelect} />}
    </div>
  ));
}

export default function Documents() {
  const showToast = useToast();
  const [folders, setFolders] = useState([]);
  const [folderMap, setFolderMap] = useState({});
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [files, setFiles] = useState(null);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [userMap, setUserMap] = useState({}); // { userId: name }
  const fileInputRef = useRef(null);

  const loadFolders = useCallback(async () => {
    try {
      const data = await getFolders();
      const fList = data.folders || [];
      const fMap = {};
      fList.forEach(f => { fMap[f.folderId] = f; });
      setFolders(fList);
      setFolderMap(fMap);
    } catch {
      showToast('フォルダの取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  useEffect(() => {
    getUsers()
      .then(data => {
        const map = {};
        (data.users || []).forEach(u => { map[u.userId] = u.name || u.email; });
        setUserMap(map);
      })
      .catch(() => {}); // fail silently
  }, []);

  function selectFolder(folderId) {
    setCurrentFolderId(folderId);
    if (folderId) {
      const f = folderMap[folderId];
      const parts = f ? (f.path || '/').split('/').filter(Boolean) : [];
      const crumbs = parts.map((name, i) => {
        const partialPath = '/' + parts.slice(0, i + 1).join('/');
        const match = Object.values(folderMap).find(x => x.path === partialPath);
        return { name, folderId: match?.folderId || null };
      });
      setBreadcrumb(crumbs);
      loadFiles(folderId);
    } else {
      setBreadcrumb([]);
      setFiles(null);
    }
  }

  async function loadFiles(folderId) {
    setFiles(null);
    try {
      const data = await getFiles(folderId);
      setFiles(data.files || []);
    } catch {
      setFiles([]);
      showToast('ファイルの取得に失敗しました', 'error');
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const body = { name: newFolderName.trim() };
    if (currentFolderId) {
      const f = folderMap[currentFolderId];
      body.parentFolderId = currentFolderId;
      body.parentPath = f?.path || '/';
    }
    try {
      await createFolder(body);
      setNewFolderName('');
      setShowFolderInput(false);
      showToast('フォルダを作成しました', 'success');
      loadFolders();
    } catch {
      showToast('フォルダ作成に失敗しました', 'error');
    }
  }

  async function downloadFile(fileId) {
    if (!currentFolderId) return;
    try {
      const data = await getDownloadUrl(currentFolderId, fileId);
      if (data.downloadUrl) window.open(data.downloadUrl, '_blank');
      else showToast('ダウンロードURLの取得に失敗しました', 'error');
    } catch {
      showToast('エラーが発生しました', 'error');
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files[0];
    if (!file || !currentFolderId) return;
    e.target.value = '';
    uploadFile(file);
  }

  async function uploadFile(file) {
    let uploadData;
    try {
      uploadData = await getUploadUrl(currentFolderId, {
        name: file.name, contentType: file.type || 'application/octet-stream', size: file.size
      });
    } catch {
      showToast('アップロードURLの取得に失敗しました', 'error');
      return;
    }
    setUploadProgress({ name: file.name, pct: 0 });
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadData.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadProgress({ name: file.name, pct: Math.round(ev.loaded / ev.total * 100) });
    };
    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        showToast(`${file.name} をアップロードしました`, 'success');
        if (currentFolderId) loadFiles(currentFolderId);
      } else {
        showToast('アップロードに失敗しました', 'error');
      }
    };
    xhr.onerror = () => { setUploadProgress(null); showToast('アップロードエラー', 'error'); };
    xhr.send(file);
  }

  const tree = buildTree(folders);

  return (
    <div>
      <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>文書管理</h2>
      <div className="doc-layout">
        {/* Folder tree */}
        <div className="folder-tree">
          <div className="folder-tree-header">
            <span className="folder-tree-label">フォルダ</span>
            <button className="folder-add-btn" onClick={() => setShowFolderInput(s => !s)}>＋</button>
          </div>
          {showFolderInput && (
            <div style={{ marginBottom: '0.5rem' }}>
              <input className="folder-inline-input" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="フォルダ名" onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus />
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={handleCreateFolder}>作成</button>
                <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => setShowFolderInput(false)}>キャンセル</button>
              </div>
            </div>
          )}
          <div id="folder-tree-list">
            {tree.length === 0 ? (
              <EmptyState
                icon="document"
                message="フォルダがありません"
                action={{ label: '+ フォルダを作成', onClick: () => setShowFolderInput(true) }}
              />
            ) : (
              <FolderTree nodes={tree} depth={0} currentFolderId={currentFolderId} onSelect={selectFolder} />
            )}
          </div>
        </div>

        {/* File area */}
        <div className="file-area">
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span className="breadcrumb-item" onClick={() => selectFolder(null)}>ホーム</span>
            {breadcrumb.map((crumb, i) => (
              <span key={i}>
                <span className="breadcrumb-sep">›</span>
                {i === breadcrumb.length - 1
                  ? <span className="breadcrumb-current">{crumb.name}</span>
                  : <span className="breadcrumb-item" onClick={() => crumb.folderId && selectFolder(crumb.folderId)}>{crumb.name}</span>
                }
              </span>
            ))}
            <div className="breadcrumb-actions">
              <button className="btn btn-primary" style={{ fontSize: '0.78rem' }} disabled={!currentFolderId} onClick={() => fileInputRef.current?.click()}>
                ⬆ アップロード
              </button>
            </div>
          </div>

          {/* File grid */}
          <div className="file-grid" id="file-grid">
            {files === null ? (
              currentFolderId
                ? [1,2,3].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: 80, borderRadius: 6 }} />)
                : <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', gridColumn: '1/-1' }}>フォルダを選択してください</div>
            ) : (
              files.length === 0 ? (
                <div style={{ gridColumn: '1/-1' }}>
                  <EmptyState
                    icon="document"
                    message="このフォルダにファイルはありません"
                    action={{ label: 'ファイルをアップロード', onClick: () => fileInputRef.current?.click() }}
                  />
                </div>
              ) : (
                <>
                  {files.map(f => (
                    <div key={f.fileId} className="file-card" onClick={() => downloadFile(f.fileId)}>
                      <div className="file-card-icon">{getFileIcon(f.name)}</div>
                      <div className="file-card-name">{f.name}</div>
                      <div className="file-card-size">{formatSize(f.size)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {userMap[f.uploadedBy] || f.uploadedBy || ''}
                        {(f.updatedAt || f.createdAt) ? ` · ${timeAgo(f.updatedAt || f.createdAt)}` : ''}
                      </div>
                    </div>
                  ))}
                  <div className="file-card file-card-add" onClick={() => fileInputRef.current?.click()}>
                    <div className="file-card-icon" style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)' }}>＋</div>
                    <div className="file-card-name" style={{ color: 'var(--color-text-muted)' }}>追加</div>
                  </div>
                </>
              )
            )}
          </div>

          {/* Upload progress */}
          {uploadProgress && (
            <div className="upload-progress">
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width: `${uploadProgress.pct}%` }} />
              </div>
              <div className="progress-label">{uploadProgress.name} — {uploadProgress.pct}%</div>
            </div>
          )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelected} />
    </div>
  );
}
