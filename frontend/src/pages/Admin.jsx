import { useState, useEffect, useCallback, Fragment } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/api';
import { getFacilities, createFacility, updateFacility, deleteFacility } from '../lib/api';
import { getOrgs, createOrg, updateOrg, deleteOrg } from '../lib/api';
import { getFacilityTypes, createFacilityType, updateFacilityType, deleteFacilityType } from '../lib/api';
import { runCleanse, runBackfill } from '../lib/api';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';

// ─────────────────────────────────────────────
// 共通：ツリー行の折りたたみボタン
// ─────────────────────────────────────────────

function CollapseBtn({ collapsed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1 }}
      title={collapsed ? '展開' : '折りたたむ'}
    >
      {collapsed ? '▶' : '▼'}
    </button>
  );
}

// ─────────────────────────────────────────────
// ① ユーザーマスタタブ
// ─────────────────────────────────────────────

function UsersTab() {
  const showToast = useToast();
  const [users, setUsers] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uData, oData] = await Promise.all([getUsers(), getOrgs()]);
      setUsers(uData.users || []);
      setOrgs(oData.orgs || []);
    } catch {
      setUsers([]);
      showToast('ユーザーの取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(fd) {
    if (!fd.email?.trim()) throw 'メールアドレスを入力してください';
    if (!fd.name?.trim()) throw '表示名を入力してください';
    await createUser({ email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user', orgId: fd.orgId || '' });
    showToast('招待メールを送信しました', 'success');
    load();
  }

  async function handleRoleChange(userId, newRole) {
    if (newRole === 'admin' && !confirm('このユーザーを管理者に昇格しますか？')) return;
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
            <tr><th scope="col">名前</th><th scope="col">メール</th><th scope="col">組織</th><th scope="col">ロール</th><th scope="col">状態</th><th scope="col">操作</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={6}><div className="skeleton skeleton-row" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>ユーザーなし</td></tr>
            ) : users.map(u => (
              <tr key={u.userId}>
                <td>{u.name}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{u.email}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{orgs.find(o => o.orgId === u.orgId)?.name || '—'}</td>
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
                  <button type="button" className="btn btn-sm" onClick={() => handleToggleEnabled(u.userId, u.enabled)}>
                    {u.enabled ? '無効化' : '有効化'}
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(u.userId, u.name)}>削除</button>
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
        <div className="field">
          <label>所属組織</label>
          <select name="orgId" defaultValue="">
            <option value="">なし</option>
            {orgs.map(o => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
          </select>
        </div>
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// ② 施設マスタタブ
// ─────────────────────────────────────────────

function FacilityRow({ f, indent, openEdit, handleDelete, collapsed, toggleCollapsed, facilityTypes }) {
  const isGroup = f.facilityType === 'group';
  const typeName = facilityTypes.find(t => t.typeId === f.facilityTypeId)?.name || (isGroup ? 'グループ' : '施設');
  return (
    <tr>
      <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
        {isGroup ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <CollapseBtn collapsed={collapsed[f.facilityId]} onToggle={() => toggleCollapsed(f.facilityId)} />
            <strong>{f.name}</strong>
          </span>
        ) : f.name}
      </td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.location || '—'}</td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{f.capacity}名</td>
      <td style={{ fontSize: '0.82rem' }}>{typeName}</td>
      <td style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => openEdit(f)}>編集</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(f)}>削除</button>
      </td>
    </tr>
  );
}

function FacilitiesTab() {
  const showToast = useToast();
  const [facilities, setFacilities] = useState(null);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const [fData, tData] = await Promise.all([getFacilities(), getFacilityTypes()]);
      setFacilities(fData.facilities || []);
      setFacilityTypes(tData.facilityTypes || []);
    } catch {
      setFacilities([]);
      showToast('施設情報の取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openEdit(f) { setEditTarget(f); setDrawerOpen(true); }

  async function handleSubmit(fd) {
    if (!fd.name?.trim()) throw '施設名を入力してください';
    if (editTarget) {
      await updateFacility(editTarget.facilityId, {
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
        facilityTypeId: fd.facilityTypeId || '',
      });
      showToast('施設を更新しました', 'success');
    } else {
      const selectedType = facilityTypes.find(t => t.typeId === fd.facilityTypeId);
      await createFacility({
        name: fd.name.trim(),
        description: fd.description || '',
        capacity: fd.capacity ? parseInt(fd.capacity) : 1,
        location: fd.location || '',
        facilityType: selectedType?.isBookable === false ? 'group' : 'facility',
        facilityTypeId: fd.facilityTypeId || '',
        parentId: fd.parentId || 'ROOT',
      });
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
      showToast(err.status === 409 ? '子施設または予約が存在するため削除できません' : '削除に失敗しました', 'error');
    }
  }

  const groups = facilities ? facilities.filter(f => f.facilityType === 'group') : [];
  const topLevel = facilities ? facilities.filter(f => f.facilityType !== 'group' && f.parentId === 'ROOT') : [];
  const toggleCollapsed = id => setCollapsed(p => ({ ...p, [id]: !p[id] }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => { setEditTarget(null); setDrawerOpen(true); }}>+ 施設追加</button>
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
                    <FacilityRow f={g} openEdit={openEdit} handleDelete={handleDelete} collapsed={collapsed} toggleCollapsed={toggleCollapsed} facilityTypes={facilityTypes} />
                    {!collapsed[g.facilityId] && facilities.filter(f => f.parentId === g.facilityId).map(child => (
                      <FacilityRow key={child.facilityId} f={child} indent openEdit={openEdit} handleDelete={handleDelete} collapsed={collapsed} toggleCollapsed={toggleCollapsed} facilityTypes={facilityTypes} />
                    ))}
                  </Fragment>
                ))}
                {topLevel.map(f => (
                  <FacilityRow key={f.facilityId} f={f} openEdit={openEdit} handleDelete={handleDelete} collapsed={collapsed} toggleCollapsed={toggleCollapsed} facilityTypes={facilityTypes} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={drawerOpen} title={editTarget ? '施設を編集' : '施設を追加'} onClose={() => setDrawerOpen(false)} onSubmit={handleSubmit}>
        <div className="field">
          <label>施設名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" defaultValue={editTarget?.name || ''} placeholder="例：第1会議室" />
        </div>
        <div className="field">
          <label>施設種別</label>
          <select name="facilityTypeId" defaultValue={editTarget?.facilityTypeId || ''}>
            <option value="">未設定</option>
            {facilityTypes.map(t => <option key={t.typeId} value={t.typeId}>{t.name}{t.isBookable === false ? '（予約不可）' : ''}</option>)}
          </select>
        </div>
        {!editTarget && (
          <div className="field">
            <label>親グループ</label>
            <select name="parentId" defaultValue="ROOT">
              <option value="ROOT">なし（トップレベル）</option>
              {groups.map(g => <option key={g.facilityId} value={g.facilityId}>{g.name}</option>)}
            </select>
          </div>
        )}
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

// ─────────────────────────────────────────────
// ③ 組織マスタタブ
// ─────────────────────────────────────────────

function OrgRow({ org, allOrgs, indent, openEdit, handleDelete, collapsed, toggleCollapsed, hasChildren }) {
  const parentName = (!org.parentOrgId || org.parentOrgId === 'ROOT')
    ? '—'
    : allOrgs.find(o => o.orgId === org.parentOrgId)?.name || org.parentOrgId;
  return (
    <tr>
      <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
        {hasChildren ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <CollapseBtn collapsed={collapsed[org.orgId]} onToggle={() => toggleCollapsed(org.orgId)} />
            <strong>{org.name}</strong>
          </span>
        ) : org.name}
      </td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{org.description || '—'}</td>
      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{parentName}</td>
      <td style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => openEdit(org)}>編集</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(org)}>削除</button>
      </td>
    </tr>
  );
}

function OrgsTab() {
  const showToast = useToast();
  const [orgs, setOrgs] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await getOrgs();
      setOrgs(data.orgs || []);
    } catch {
      setOrgs([]);
      showToast('組織情報の取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openEdit(org) { setEditTarget(org); setDrawerOpen(true); }

  async function handleSubmit(fd) {
    if (!fd.name?.trim()) throw '組織名を入力してください';
    if (editTarget) {
      await updateOrg(editTarget.orgId, { name: fd.name.trim(), description: fd.description || '' });
      showToast('組織を更新しました', 'success');
    } else {
      await createOrg({ name: fd.name.trim(), description: fd.description || '', parentOrgId: fd.parentOrgId || 'ROOT' });
      showToast('組織を作成しました', 'success');
    }
    setDrawerOpen(false);
    load();
  }

  async function handleDelete(org) {
    if (!confirm(`「${org.name}」を削除しますか？`)) return;
    try {
      await deleteOrg(org.orgId);
      showToast('組織を削除しました', 'success');
      load();
    } catch (err) {
      showToast(err.status === 409 ? '配下の組織またはユーザーが存在するため削除できません' : '削除に失敗しました', 'error');
    }
  }

  const toggleCollapsed = id => setCollapsed(p => ({ ...p, [id]: !p[id] }));
  const rootOrgs = orgs ? orgs.filter(o => o.parentOrgId === 'ROOT') : [];
  const getChildren = parentId => orgs ? orgs.filter(o => o.parentOrgId === parentId) : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => { setEditTarget(null); setDrawerOpen(true); }}>+ 組織追加</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th scope="col">組織名</th><th scope="col">説明</th><th scope="col">親組織</th><th scope="col">操作</th></tr>
          </thead>
          <tbody>
            {orgs === null ? (
              <tr><td colSpan={4}><div className="skeleton skeleton-row" /></td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>組織なし</td></tr>
            ) : (
              <>
                {rootOrgs.map(org => {
                  const children = getChildren(org.orgId);
                  return (
                    <Fragment key={org.orgId}>
                      <OrgRow org={org} allOrgs={orgs} openEdit={openEdit} handleDelete={handleDelete} collapsed={collapsed} toggleCollapsed={toggleCollapsed} hasChildren={children.length > 0} />
                      {!collapsed[org.orgId] && children.map(child => (
                        <OrgRow key={child.orgId} org={child} allOrgs={orgs} indent openEdit={openEdit} handleDelete={handleDelete} collapsed={collapsed} toggleCollapsed={toggleCollapsed} hasChildren={false} />
                      ))}
                    </Fragment>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={drawerOpen} title={editTarget ? '組織を編集' : '組織を追加'} onClose={() => setDrawerOpen(false)} onSubmit={handleSubmit}>
        <div className="field">
          <label>組織名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" defaultValue={editTarget?.name || ''} placeholder="例：営業部" />
        </div>
        <div className="field">
          <label>説明</label>
          <textarea name="description" defaultValue={editTarget?.description || ''} placeholder="任意の説明..." />
        </div>
        {!editTarget && (
          <div className="field">
            <label>親組織</label>
            <select name="parentOrgId" defaultValue="ROOT">
              <option value="ROOT">なし（トップレベル）</option>
              {(orgs || []).map(o => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// ④ 施設種別マスタタブ
// ─────────────────────────────────────────────

function FacilityTypesTab() {
  const showToast = useToast();
  const [types, setTypes] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isBookable, setIsBookable] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getFacilityTypes();
      setTypes(data.facilityTypes || []);
    } catch {
      setTypes([]);
      showToast('施設種別の取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openEdit(t) {
    setEditTarget(t);
    setIsBookable(t.isBookable !== false);
    setDrawerOpen(true);
  }

  function openCreate() {
    setEditTarget(null);
    setIsBookable(true);
    setDrawerOpen(true);
  }

  async function handleSubmit(fd) {
    if (!fd.name?.trim()) throw '種別名を入力してください';
    if (editTarget) {
      await updateFacilityType(editTarget.typeId, { name: fd.name.trim(), description: fd.description || '', isBookable });
      showToast('施設種別を更新しました', 'success');
    } else {
      await createFacilityType({ name: fd.name.trim(), description: fd.description || '', isBookable });
      showToast('施設種別を作成しました', 'success');
    }
    setDrawerOpen(false);
    load();
  }

  async function handleDelete(t) {
    if (!confirm(`「${t.name}」を削除しますか？`)) return;
    try {
      await deleteFacilityType(t.typeId);
      showToast('施設種別を削除しました', 'success');
      load();
    } catch (err) {
      showToast(err.status === 409 ? 'この種別を使用中の施設があるため削除できません' : '削除に失敗しました', 'error');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={openCreate}>+ 種別追加</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th scope="col">種別名</th><th scope="col">説明</th><th scope="col">予約可否</th><th scope="col">操作</th></tr>
          </thead>
          <tbody>
            {types === null ? (
              <tr><td colSpan={4}><div className="skeleton skeleton-row" /></td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>施設種別なし</td></tr>
            ) : types.map(t => (
              <tr key={t.typeId}>
                <td>{t.name}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{t.description || '—'}</td>
                <td>
                  <span className={`badge ${t.isBookable !== false ? 'badge-green' : 'badge-gray'}`}>
                    {t.isBookable !== false ? '予約可' : '予約不可'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" className="btn btn-sm" onClick={() => openEdit(t)}>編集</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(t)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={drawerOpen} title={editTarget ? '種別を編集' : '種別を追加'} onClose={() => setDrawerOpen(false)} onSubmit={handleSubmit}>
        <div className="field">
          <label>種別名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" defaultValue={editTarget?.name || ''} placeholder="例：会議室・社用車・プロジェクター" />
        </div>
        <div className="field">
          <label>説明</label>
          <textarea name="description" defaultValue={editTarget?.description || ''} placeholder="任意の説明..." />
        </div>
        <div className="field">
          <div className="field-inline">
            <label className="toggle">
              <input type="checkbox" checked={isBookable} onChange={e => setIsBookable(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span style={{ fontSize: '0.85rem' }}>予約可能</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
            オフにするとグループ・分類ノードとして使用
          </p>
        </div>
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// ⑤ 依存関係タブ
// ─────────────────────────────────────────────

// システム定義の依存ルール（表示専用 — 変更はバックエンドで管理）
// required:     このフィールドが論理的に必須かどうか
// backfillable: 親マスタから選択してデフォルト値を一括設定できるか
const RELATION_RULES = [
  { id: 'reservation_facility',  child: 'RESERVATION',    field: 'facilityId',     parent: 'FACILITY',     onDelete: 'CASCADE',  required: true,  backfillable: false, desc: '施設が削除されると紐づく予約も連鎖削除' },
  { id: 'reservation_user',      child: 'RESERVATION',    field: 'reservedBy',     parent: 'USER',         onDelete: 'SET_NULL', required: true,  backfillable: false, desc: 'ユーザー削除後も予約は残るが予約者が匿名化' },
  { id: 'schedule_user',         child: 'SCHEDULE',       field: 'createdBy',      parent: 'USER',         onDelete: 'SET_NULL', required: true,  backfillable: false, desc: 'ユーザー削除後もスケジュールは残るが作成者が匿名化' },
  { id: 'document_user',         child: 'DOCUMENT',       field: 'uploadedBy',     parent: 'USER',         onDelete: 'SET_NULL', required: true,  backfillable: false, desc: 'ユーザー削除後もドキュメントは残るがアップロード者が匿名化' },
  { id: 'facility_parent',       child: 'FACILITY',       field: 'parentId',       parent: 'FACILITY',     onDelete: 'RESTRICT', required: true,  backfillable: false, desc: '子施設が存在する間はグループ削除不可（実装済み）' },
  { id: 'facility_type',         child: 'FACILITY',       field: 'facilityTypeId', parent: 'FACILITYTYPE', onDelete: 'RESTRICT', required: true,  backfillable: true,  desc: '使用中の施設種別は削除不可' },
  { id: 'facility_org',          child: 'FACILITY',       field: 'orgId',          parent: 'ORG',          onDelete: 'SET_NULL', required: false, backfillable: true,  desc: '組織解体後も施設は残るが所属組織が解除' },
  { id: 'user_org',              child: 'USER_PROFILE',   field: 'orgId',          parent: 'ORG',          onDelete: 'SET_NULL', required: false, backfillable: true,  desc: '組織解体後もユーザーは残るが所属組織が解除' },
];

// 親エンティティ名 → { APIローダー, value/labelの取得 }
const PARENT_API = {
  ORG:          () => getOrgs().then(d => (d.orgs || []).map(o => ({ value: o.orgId,       label: o.name }))),
  FACILITYTYPE: () => getFacilityTypes().then(d => (d.facilityTypes || []).map(t => ({ value: t.typeId,    label: t.name }))),
  FACILITY:     () => getFacilities().then(d => (d.facilities || []).map(f => ({ value: f.facilityId, label: f.name }))),
};

// バックフィル行コンポーネント（1ルール = 1行）
function BackfillRow({ rule }) {
  const showToast = useToast();
  const [options, setOptions] = useState(null); // null = ロード中
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const loader = PARENT_API[rule.parent];
    if (loader) {
      loader().then(setOptions).catch(() => setOptions([]));
    } else {
      setOptions([]);
    }
  }, [rule.parent]);

  async function handleBackfill() {
    if (!selected) return;
    const label = options?.find(o => o.value === selected)?.label || selected;
    if (!confirm(`「${rule.child}.${rule.field}」が未設定のレコードへ「${label}」をデフォルト値として設定します。よろしいですか？`)) return;
    setRunning(true);
    try {
      const res = await runBackfill(rule.id, selected);
      showToast(`バックフィル完了（${res.updatedCount ?? 0}件更新）`, 'success');
    } catch {
      showToast('バックフィルに失敗しました', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <tr>
      <td>
        <code style={{ fontSize: '0.78rem' }}>{rule.child}</code>
        {rule.required && <span className="badge badge-blue" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>必須</span>}
      </td>
      <td><code style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{rule.field}</code></td>
      <td><code style={{ fontSize: '0.78rem' }}>{rule.parent}</code></td>
      <td>
        {options === null ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>読み込み中…</span>
        ) : (
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid var(--color-border)', minWidth: 160 }}
          >
            <option value="">— デフォルト値を選択 —</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={handleBackfill}
          disabled={!selected || running || options === null}
        >
          {running ? '実行中…' : 'バックフィル'}
        </button>
      </td>
    </tr>
  );
}

const POLICY_STYLE = {
  CASCADE:  { cls: 'badge-red',    label: 'CASCADE'  },
  RESTRICT: { cls: 'badge-orange', label: 'RESTRICT' },
  SET_NULL: { cls: 'badge-blue',   label: 'SET_NULL' },
  IGNORE:   { cls: 'badge-gray',   label: 'IGNORE'   },
};

function RelationsTab() {
  const showToast = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { dryRun, cleanedAt, summary[] }

  async function handleCleanse(dryRun) {
    if (!dryRun && !confirm('実際にデータを修正します。よろしいですか？')) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await runCleanse(dryRun);
      setResult({ ...data, dryRun, cleanedAt: new Date().toLocaleString('ja-JP') });
      showToast(dryRun ? 'ドライラン完了' : 'クレンジング完了', 'success');
    } catch {
      showToast('クレンジングに失敗しました', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      {/* 説明 */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: '#fffbeb', border: '1px solid #fde68a' }}>
        <p style={{ fontSize: '0.83rem', color: '#78350f', margin: 0 }}>
          DynamoDB はFK制約を持たないため、参照整合性はアプリケーション層で管理します。
          下表の依存ルールに基づいてオーファンレコードを検出・修正できます。
          ルール定義の変更はバックエンドの管理者作業が必要です。
        </p>
      </div>

      {/* 依存ルール一覧 */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">子エンティティ</th>
              <th scope="col">参照フィールド</th>
              <th scope="col">親エンティティ</th>
              <th scope="col">必須</th>
              <th scope="col">削除ポリシー</th>
              <th scope="col">説明</th>
            </tr>
          </thead>
          <tbody>
            {RELATION_RULES.map(r => {
              const ps = POLICY_STYLE[r.onDelete] || POLICY_STYLE.IGNORE;
              return (
                <tr key={r.id}>
                  <td><code style={{ fontSize: '0.78rem' }}>{r.child}</code></td>
                  <td><code style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{r.field}</code></td>
                  <td><code style={{ fontSize: '0.78rem' }}>{r.parent}</code></td>
                  <td>
                    {r.required
                      ? <span className="badge badge-blue">必須</span>
                      : <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>任意</span>}
                  </td>
                  <td><span className={`badge ${ps.cls}`}>{ps.label}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{r.desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* クレンジング実行 */}
      <div className="card" style={{ padding: '1rem 1.25rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>データクレンジング</h3>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: result ? '1rem' : 0 }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleCleanse(true)}
            disabled={running}
          >
            {running ? '実行中...' : 'ドライラン（件数確認のみ）'}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => handleCleanse(false)}
            disabled={running}
          >
            {running ? '実行中...' : 'クレンジング実行（データ修正）'}
          </button>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
          ドライランで件数を確認してから実行することを推奨します。
        </p>

        {result && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {result.dryRun ? '[ドライラン] ' : '[実行済み] '}
              {result.cleanedAt}
            </p>
            {(result.summary || []).length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>オーファンレコードは見つかりませんでした</p>
            ) : (
              <table style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr><th scope="col">ルール</th><th scope="col">検出件数</th><th scope="col">処理</th></tr>
                </thead>
                <tbody>
                  {result.summary.map((s, i) => (
                    <tr key={i}>
                      <td><code style={{ fontSize: '0.78rem' }}>{s.ruleId}</code></td>
                      <td>{s.orphanCount}件</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{s.action || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {/* バックフィル */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.3rem' }}>フィールド バックフィル</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.85rem' }}>
          フィールドを新たに追加した際、すでに存在するレコードに値が欠落している場合があります。
          親マスタからデフォルト値を選択して一括設定します。
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">対象エンティティ</th>
              <th scope="col">フィールド</th>
              <th scope="col">参照先マスタ</th>
              <th scope="col">デフォルト値（選択）</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {RELATION_RULES.filter(r => r.backfillable).map(rule => (
              <BackfillRow key={rule.id} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 管理設定ページ本体
// ─────────────────────────────────────────────

const TABS = [
  { id: 'users',         label: 'ユーザー' },
  { id: 'facilities',    label: '施設' },
  { id: 'orgs',          label: '組織' },
  { id: 'facilityTypes', label: '施設種別' },
  { id: 'relations',     label: '依存関係' },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div>
      <div className="page-header"><h2>管理設定</h2></div>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
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
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'users'         && <UsersTab />}
      {activeTab === 'facilities'    && <FacilitiesTab />}
      {activeTab === 'orgs'          && <OrgsTab />}
      {activeTab === 'facilityTypes' && <FacilityTypesTab />}
      {activeTab === 'relations'     && <RelationsTab />}
    </div>
  );
}
