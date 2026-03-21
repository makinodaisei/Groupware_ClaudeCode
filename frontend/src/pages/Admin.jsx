import { useState, useEffect, useCallback, Fragment } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/api';
import { getFacilities, createFacility, updateFacility, deleteFacility } from '../lib/api';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';

// ---------- 施設行コンポーネント（モジュールレベル） ----------

function FacilityRow({ f, indent = false, openEdit, handleDelete, collapsed, toggleCollapsed }) {
  const isGroup = f.facilityType === 'group';
  const isCollapsed = collapsed[f.facilityId];
  return (
    <tr>
      <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
        {isGroup ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={() => toggleCollapsed(f.facilityId)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1 }}
              title={isCollapsed ? '展開' : '折りたたむ'}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
            <strong>{f.name}</strong>
          </span>
        ) : f.name}
      </td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.location || '-'}</td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.capacity}名</td>
      <td>
        <span className={`badge ${f.facilityType === 'group' ? 'badge-orange' : 'badge-blue'}`}>
          {f.facilityType === 'group' ? 'グループ' : '施設'}
        </span>
      </td>
      <td style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => openEdit(f)}>編集</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(f)}>削除</button>
      </td>
    </tr>
  );
}

// ---------- ユーザーマスタタブ ----------

function UsersTab() {
  const showToast = useToast();
  const [users, setUsers] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
      showToast('ユーザーの取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(fd) {
    if (!fd.email?.trim()) throw 'メールアドレスを入力してください';
    if (!fd.name?.trim()) throw '表示名を入力してください';
    await createUser({ email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user' });
    showToast('招待メールを送信しました', 'success');
    load();
  }

  async function handleRoleChange(userId, newRole) {
    try {
      await updateUser(userId, { role: newRole });
      showToast('ロールを変更しました', 'success');
      load();
    } catch {
      showToast('ロール変更に失敗しました', 'error');
    }
  }

  async function handleToggleEnabled(userId, currentEnabled) {
    try {
      await updateUser(userId, { enabled: !currentEnabled });
      showToast(currentEnabled ? 'アカウントを無効化しました' : 'アカウントを有効化しました', 'success');
      load();
    } catch {
      showToast('操作に失敗しました', 'error');
    }
  }

  async function handleDelete(userId, name) {
    if (!confirm(`${name} を削除しますか？この操作は取り消せません。`)) return;
    try {
      await deleteUser(userId);
      showToast('ユーザーを削除しました', 'success');
      load();
    } catch {
      showToast('削除に失敗しました', 'error');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>+ ユーザー招待</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th scope="col">名前</th><th scope="col">メール</th><th scope="col">ロール</th><th scope="col">状態</th><th scope="col">操作</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={5}><div className="skeleton skeleton-row" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>ユーザーなし</td></tr>
            ) : users.map(u => (
              <tr key={u.userId}>
                <td>{u.name}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.userId, e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: 4 }}
                  >
                    <option value="user">user</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.enabled ? 'badge-green' : 'badge-gray'}`}>
                    {u.enabled ? '有効' : '無効'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleToggleEnabled(u.userId, u.enabled)}
                  >
                    {u.enabled ? '無効化' : '有効化'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(u.userId, u.name)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={inviteOpen} title="ユーザーを招待" onClose={() => setInviteOpen(false)} onSubmit={handleInvite}>
        <div className="field">
          <label>メールアドレス <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="email" name="email" placeholder="user@example.com" />
        </div>
        <div className="field">
          <label>表示名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" placeholder="山田 太郎" />
        </div>
        <div className="field">
          <label>ロール</label>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            {['user', 'editor', 'admin'].map(r => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input type="radio" name="role" value={r} defaultChecked={r === 'user'} /> {r}
              </label>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ---------- 施設マスタタブ ----------

function FacilitiesTab() {
  const showToast = useToast();
  const [facilities, setFacilities] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await getFacilities();
      setFacilities(data.facilities || []);
    } catch {
      setFacilities([]);
      showToast('施設情報の取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setDrawerOpen(true); }
  function openEdit(f) { setEditTarget(f); setDrawerOpen(true); }

  async function handleSubmit(fd) {
    if (!fd.name?.trim()) throw '施設名を入力してください';
    if (editTarget) {
      // PUT は name/description/capacity/location のみ（facilityType/parentId は変更不可）
      const payload = {
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
      };
      await updateFacility(editTarget.facilityId, payload);
      showToast('施設を更新しました', 'success');
    } else {
      const payload = {
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
        facilityType: fd.facilityType || 'facility',
        parentId: fd.parentId || 'ROOT',
      };
      await createFacility(payload);
      showToast('施設を作成しました', 'success');
    }
    setDrawerOpen(false);
    load();
  }

  async function handleDelete(f) {
    if (!confirm(`「${f.name}」を削除しますか？`)) return;
    try {
      await deleteFacility(f.facilityId);
      showToast('施設を削除しました', 'success');
      load();
    } catch (err) {
      if (err.status === 409) {
        showToast('子施設または予約が存在するため削除できません', 'error');
      } else {
        showToast('削除に失敗しました', 'error');
      }
    }
  }

  const groups = facilities ? facilities.filter(f => f.facilityType === 'group') : [];
  const topLevel = facilities ? facilities.filter(f => f.facilityType !== 'group' && f.parentId === 'ROOT') : [];

  function getChildren(groupId) {
    return facilities ? facilities.filter(f => f.parentId === groupId) : [];
  }

  function toggleCollapsed(groupId) {
    setCollapsed(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={openCreate}>+ 施設追加</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th scope="col">名前</th><th scope="col">場所</th><th scope="col">収容</th><th scope="col">種別</th><th scope="col">操作</th></tr>
          </thead>
          <tbody>
            {facilities === null ? (
              <tr><td colSpan={5}><div className="skeleton skeleton-row" /></td></tr>
            ) : facilities.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>施設なし</td></tr>
            ) : (
              <>
                {groups.map(g => (
                  <Fragment key={g.facilityId}>
                    <FacilityRow
                      f={g}
                      openEdit={openEdit}
                      handleDelete={handleDelete}
                      collapsed={collapsed}
                      toggleCollapsed={toggleCollapsed}
                    />
                    {!collapsed[g.facilityId] && getChildren(g.facilityId).map(child => (
                      <FacilityRow
                        key={child.facilityId}
                        f={child}
                        indent
                        openEdit={openEdit}
                        handleDelete={handleDelete}
                        collapsed={collapsed}
                        toggleCollapsed={toggleCollapsed}
                      />
                    ))}
                  </Fragment>
                ))}
                {topLevel.map(f => (
                  <FacilityRow
                    key={f.facilityId}
                    f={f}
                    openEdit={openEdit}
                    handleDelete={handleDelete}
                    collapsed={collapsed}
                    toggleCollapsed={toggleCollapsed}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        isOpen={drawerOpen}
        title={editTarget ? '施設を編集' : '施設を追加'}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label>施設名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" defaultValue={editTarget?.name || ''} placeholder="例：第1会議室" />
        </div>
        <div className="field">
          <label>種別</label>
          <select name="facilityType" defaultValue={editTarget?.facilityType || 'facility'} disabled={!!editTarget}>
            <option value="facility">施設（予約可能）</option>
            <option value="group">グループ（分類用）</option>
          </select>
        </div>
        <div className="field">
          <label>親グループ</label>
          <select name="parentId" defaultValue={editTarget?.parentId || 'ROOT'} disabled={!!editTarget}>
            <option value="ROOT">なし（トップレベル）</option>
            {groups.map(g => (
              <option key={g.facilityId} value={g.facilityId}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>収容人数</label>
          <input type="number" name="capacity" min="1" defaultValue={editTarget?.capacity || 1} />
        </div>
        <div className="field">
          <label>場所</label>
          <input type="text" name="location" defaultValue={editTarget?.location || ''} placeholder="例：3F 東棟" />
        </div>
        <div className="field">
          <label>説明</label>
          <textarea name="description" defaultValue={editTarget?.description || ''} placeholder="任意の説明..." />
        </div>
      </Drawer>
    </div>
  );
}

// ---------- 管理設定ページ本体 ----------

const TABS = [
  { id: 'users', label: 'ユーザーマスタ' },
  { id: 'facilities', label: '施設マスタ' },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>管理設定</h2>
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map(tab => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'users' ? <UsersTab /> : <FacilitiesTab />}
    </div>
  );
}
