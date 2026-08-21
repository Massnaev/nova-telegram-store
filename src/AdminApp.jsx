import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  FolderTree,
  LockKeyhole,
  LogOut,
  ImagePlus,
  Moon,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import './admin.css';

const emptyCategory = { name: '', subtitle: '', tone: 'blue', sortOrder: 0, active: true };
const emptyVariant = () => ({ name: '', slug: '', stock: 0, active: true });
const emptyProduct = {
  categoryId: '', name: '', caption: '', description: '', imageUrl: '', price: 0,
  tone: 'blue', sortOrder: 0, active: true, variants: [emptyVariant()],
};

async function api(path, token, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Не удалось выполнить запрос');
    error.code = body.error?.code;
    throw error;
  }
  return body.data;
}

function Login({ onLogin, busy, error }) {
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  return (
    <main className="admin-login">
      <section className="admin-login-card">
        <div className="admin-login-icon"><LockKeyhole size={28} /></div>
        <h1>Панель управления</h1>
        <p>Вход по ключу доступа администратора</p>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(token.trim()); }}>
          <div className="admin-field">
            <div className="admin-password">
              <input type={visible ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Введите ADMIN_TOKEN" required autoFocus />
              <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Скрыть' : 'Показать'}>
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>
          {error && <div className="admin-login-error" role="alert">{error}</div>}
          <button className="admin-primary" type="submit" disabled={busy || !token.trim()}>
            {busy ? 'Проверяем ключ…' : 'Войти в панель'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({ label, children }) {
  return <label className="admin-field"><span>{label}</span>{children}</label>;
}

function Sheet({ title, subtitle, onClose, children }) {
  return (
    <div className="admin-sheet-backdrop" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-sheet">
        <header className="admin-sheet-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="admin-icon" type="button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function CategoryForm({ initial, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => initial ? { ...initial } : { ...emptyCategory });
  return (
    <Sheet title={initial ? 'Редактировать категорию' : 'Новая категория'} subtitle="Раздел каталога" onClose={onClose}>
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
        <Field label="Название категории *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Жидкости" required /></Field>
        <Field label="Подпись"><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Например: Солевые и органические" /></Field>
        <div className="admin-form-grid">
          <Field label="Порядок сортировки"><input type="number" min="0" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
          <Field label="Цвет акцента"><select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}><option value="blue">Синий</option><option value="orange">Оранжевый</option><option value="mint">Мятный</option><option value="violet">Фиолетовый</option><option value="rose">Розовый</option></select></Field>
        </div>
        <label className="admin-switch"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span /><b>Категория видна покупателям</b></label>
        <button className="admin-primary" type="submit" disabled={busy}><Save size={19} />{busy ? 'Сохраняем…' : 'Сохранить категорию'}</button>
      </form>
    </Sheet>
  );
}

function ProductForm({ initial, categories, busy, onSave, onClose }) {
  const [form, setForm] = useState(() => initial ? {
    ...initial,
    variants: initial.variants.map((variant) => ({ ...variant })),
  } : { ...emptyProduct, categoryId: categories[0]?.id ?? '', variants: [emptyVariant()] });
  const [deletedVariantIds, setDeletedVariantIds] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? '');
  const [imageError, setImageError] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const updateVariant = (index, patch) => setForm((current) => ({
    ...current,
    variants: current.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...patch } : variant),
  }));
  const removeVariant = (index) => {
    const target = form.variants[index];
    if (target?.id) {
      setDeletedVariantIds((current) => [...current, target.id]);
    }
    setForm((current) => ({ ...current, variants: current.variants.filter((_, variantIndex) => variantIndex !== index) }));
  };
  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Выберите JPG, PNG или WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Фотография должна быть не больше 5 МБ.');
      return;
    }
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
    setImageError('');
  };
  const clearImage = () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(Boolean(initial?.imageUrl));
    setImageError('');
  };

  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  return (
    <Sheet title={initial ? 'Редактировать товар' : 'Новый товар'} subtitle="Карточка товара" onClose={onClose}>
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, imageFile, removeImage, deletedVariantIds }); }}>
        <Field label="Категория *"><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></Field>
        <Field label="Название *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Короткая подпись"><input value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} placeholder="Показывается в карточке" /></Field>
        <Field label="Описание"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows="4" /></Field>
        <div className="admin-image-field">
          <div className="admin-image-copy"><span>Фотография товара</span><small>JPG, PNG или WebP · до 5 МБ</small></div>
          {imagePreview ? (
            <div className="admin-image-preview">
              <img src={imagePreview} alt={`Предпросмотр: ${form.name || 'товар'}`} />
              <div>
                <label className="admin-image-action"><ImagePlus size={17} /> Заменить<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label>
                <button className="admin-image-action danger" type="button" onClick={clearImage}><Trash2 size={17} /> Удалить</button>
              </div>
            </div>
          ) : (
            <label className="admin-image-drop"><ImagePlus size={25} /><strong>Выбрать фотографию</strong><span>Откроется галерея или проводник</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label>
          )}
          {imageError && <div className="admin-image-error" role="alert">{imageError}</div>}
        </div>
        <div className="admin-form-grid">
          <Field label="Цена, ₽ *"><input type="number" min="0" inputMode="numeric" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} required /></Field>
          <Field label="Порядок"><input type="number" min="0" inputMode="numeric" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></Field>
        </div>
        <Field label="Цвет карточки"><select value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}><option value="blue">Синий</option><option value="orange">Оранжевый</option><option value="mint">Мятный</option><option value="violet">Фиолетовый</option><option value="rose">Розовый</option></select></Field>
        <label className="admin-switch"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span /><b>Товар виден покупателям</b></label>

        <div className="admin-variants-heading"><div><span>Варианты (вкусы) и остатки</span><small>Минимум один вариант</small></div><button type="button" onClick={() => setForm({ ...form, variants: [...form.variants, emptyVariant()] })}><Plus size={17} /> Добавить</button></div>
        <div className="admin-variant-list">
          {form.variants.map((variant, index) => (
            <fieldset className="admin-variant" key={variant.id ?? `new-${index}`}>
              <legend>Вариант {index + 1}</legend>
              <Field label="Название вкуса/варианта *"><input value={variant.name} onChange={(event) => updateVariant(index, { name: event.target.value })} placeholder="Например: Манго со льдом" required /></Field>
              <div className="admin-form-grid">
                <Field label="Код"><input value={variant.slug} onChange={(event) => updateVariant(index, { slug: event.target.value })} placeholder="Создастся сам" disabled={Boolean(variant.id)} /></Field>
                <Field label="Остаток (шт.)"><input type="number" min="0" inputMode="numeric" value={variant.stock} onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })} /></Field>
              </div>
              <label className="admin-switch compact"><input type="checkbox" checked={variant.active} onChange={(event) => updateVariant(index, { active: event.target.checked })} /><span /><b>Доступен для заказа</b></label>
              {form.variants.length > 1 && <button className="admin-remove-variant" type="button" onClick={() => removeVariant(index)}><Trash2 size={16} /> Удалить вариант</button>}
            </fieldset>
          ))}
        </div>
        <button className="admin-primary" type="submit" disabled={busy || !form.variants.length}><Save size={19} />{busy ? 'Сохраняем…' : 'Сохранить товар'}</button>
      </form>
    </Sheet>
  );
}

function SettingsView({ settings, busy, onSave }) {
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  return (
    <div className="admin-settings-card">
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <Field label="Название магазина *">
          <input
            value={form.store_name}
            onChange={(e) => setForm({ ...form, store_name: e.target.value })}
            placeholder="Например: NOVA Market"
            required
          />
        </Field>
        <Field label="Слоган / Заголовок витрины">
          <input
            value={form.store_tagline}
            onChange={(e) => setForm({ ...form, store_tagline: e.target.value })}
            placeholder="Например: Большой выбор. Легко заказать."
          />
        </Field>
        <Field label="Описание витрины">
          <textarea
            value={form.store_description}
            onChange={(e) => setForm({ ...form, store_description: e.target.value })}
            rows="3"
            placeholder="Текст под заголовком на главном баннере"
          />
        </Field>
        <Field label="Telegram менеджера (без @ или с @)">
          <input
            value={form.admin_username}
            onChange={(e) => setForm({ ...form, admin_username: e.target.value })}
            placeholder="Например: manager_username"
          />
        </Field>
        <button className="admin-primary" type="submit" disabled={busy}>
          <Save size={19} />
          {busy ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </form>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? dateString : new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

const formatMoney = (amount) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;
const orderLabels = { new: 'Новый', confirmed: 'Подтверждён', completed: 'Выполнен', cancelled: 'Отменён' };

function OrderSheet({ order, busy, onStatus, onClose }) {
  const customer = order.customer.username ? `@${order.customer.username}` : order.customer.telegramUserId ? `ID ${order.customer.telegramUserId}` : 'Гость';
  return (
    <Sheet title={`Заказ №${order.id}`} subtitle={formatDate(order.createdAt)} onClose={onClose}>
      <div className="admin-order-detail">
        <div className="admin-order-summary">
          <div><span>Статус</span><strong className={`admin-order-status status-${order.status}`}>{orderLabels[order.status]}</strong></div>
          <div><span>Покупатель</span><strong>{customer}</strong></div>
          <div><span>Сумма</span><strong>{formatMoney(order.total)}</strong></div>
        </div>
        <section className="admin-order-items">
          <h3>Состав заказа</h3>
          {order.items.map((item) => (
            <article key={`${item.productId}-${item.variantId}`}>
              <div><strong>{item.productName}</strong><span>{item.variantName} · {item.quantity} шт.</span></div>
              <b>{formatMoney(item.lineTotal)}</b>
            </article>
          ))}
        </section>
        {order.comment && <section className="admin-order-comment"><span>Комментарий покупателя</span><p>{order.comment}</p></section>}
        <div className="admin-order-actions">
          {order.customer.username && (
            <a
              className="admin-primary"
              href={`https://t.me/${order.customer.username.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              💬 Написать клиенту (@{order.customer.username.replace(/^@/, '')})
            </a>
          )}
          {order.status === 'new' && <button className="admin-primary" type="button" disabled={busy} onClick={() => onStatus(order.id, 'confirmed')}><CheckCircle2 size={19} /> Подтвердить заказ</button>}
          {order.status === 'confirmed' && <button className="admin-primary" type="button" disabled={busy} onClick={() => onStatus(order.id, 'completed')}><CheckCircle2 size={19} /> Завершить заказ</button>}
          {['new', 'confirmed'].includes(order.status) && <button className="admin-danger-button" type="button" disabled={busy} onClick={() => window.confirm('Отменить заказ и вернуть товары на склад?') && onStatus(order.id, 'cancelled')}><X size={19} /> Отменить и вернуть остатки</button>}
          {['completed', 'cancelled'].includes(order.status) && <div className="admin-order-final"><CheckCircle2 size={20} /><span>Заказ закрыт, дальнейшие изменения недоступны.</span></div>}
        </div>
      </div>
    </Sheet>
  );
}

export default function AdminApp({ onGoToStore }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('nova-admin-token') || localStorage.getItem('nova_admin_token') || '');
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState('products');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ store_name: '', store_tagline: '', store_description: '', admin_username: '' });
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('nova-admin-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nova-admin-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const stats = useMemo(() => ({
    products: products.length,
    stock: products.flatMap((product) => product.variants).reduce((sum, variant) => sum + variant.stock, 0),
    newOrders: orders.filter((order) => order.status === 'new').length,
  }), [products, orders]);

  const load = async (nextToken = token) => {
    setLoading(true);
    setError('');
    try {
      const [categoryData, productData, orderData, settingsData] = await Promise.all([
        api('/admin/categories', nextToken),
        api('/admin/products', nextToken),
        api('/admin/orders', nextToken),
        api('/admin/settings', nextToken),
      ]);
      setCategories(categoryData);
      setProducts(productData);
      setOrders(orderData);
      setSettings(settingsData);
      setAuthorized(true);
      setToken(nextToken);
      sessionStorage.setItem('nova-admin-token', nextToken);
      localStorage.setItem('nova_admin_token', nextToken);
    } catch (loadError) {
      setAuthorized(false);
      setError(loadError.code === 'ADMIN_UNAUTHORIZED' ? 'Ключ не подходит. Проверьте ADMIN_TOKEN.' : loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      load(token);
    } else {
      const initData = window.Telegram?.WebApp?.initData;
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (initData || user?.id) {
        fetch('/api/auth/telegram-admin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData, telegramUserId: user?.id ? String(user.id) : undefined }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.ok && res.adminToken) {
              load(res.adminToken);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const mutate = async (action, successMessage) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      setEditor(null);
      setNotice(successMessage);
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = (form) => mutate(
    () => api(editor.item ? `/admin/categories/${editor.item.id}` : '/admin/categories', token, {
      method: editor.item ? 'PATCH' : 'POST', body: JSON.stringify(form),
    }),
    editor.item ? 'Категория обновлена' : 'Категория создана',
  );

  const saveProduct = (form) => mutate(async () => {
    const { variants, imageFile, removeImage, deletedVariantIds, ...productFields } = form;
    const previousImageUrl = editor.item?.imageUrl ?? '';
    let uploadedImageUrl = '';
    try {
      if (imageFile) {
        const imageForm = new FormData();
        imageForm.append('image', imageFile);
        const uploaded = await api('/admin/uploads/product-image', token, { method: 'POST', body: imageForm });
        uploadedImageUrl = uploaded.imageUrl;
        productFields.imageUrl = uploadedImageUrl;
      } else if (removeImage) {
        productFields.imageUrl = '';
      }

      if (!editor.item) {
        await api('/admin/products', token, { method: 'POST', body: JSON.stringify({ ...productFields, variants }) });
      } else {
        await api(`/admin/products/${editor.item.id}`, token, { method: 'PATCH', body: JSON.stringify(productFields) });
        if (deletedVariantIds?.length) {
          await Promise.all(deletedVariantIds.map((id) => api(`/admin/variants/${id}`, token, { method: 'DELETE' })));
        }
        await Promise.all(variants.map((variant) => variant.id
          ? api(`/admin/variants/${variant.id}`, token, {
            method: 'PATCH', body: JSON.stringify({ name: variant.name, stock: variant.stock, active: variant.active }),
          })
          : api(`/admin/products/${editor.item.id}/variants`, token, { method: 'POST', body: JSON.stringify(variant) })));
      }
      if (previousImageUrl && previousImageUrl !== productFields.imageUrl && (uploadedImageUrl || removeImage)) {
        await api('/admin/uploads/product-image', token, { method: 'DELETE', body: JSON.stringify({ imageUrl: previousImageUrl }) });
      }
    } catch (saveError) {
      if (uploadedImageUrl) {
        await api('/admin/uploads/product-image', token, { method: 'DELETE', body: JSON.stringify({ imageUrl: uploadedImageUrl }) }).catch(() => {});
      }
      throw saveError;
    }
  }, editor.item ? 'Товар обновлён' : 'Товар создан');

  const saveSettings = (form) => mutate(
    () => api('/admin/settings', token, { method: 'PATCH', body: JSON.stringify(form) }),
    'Настройки магазина сохранены',
  );

  const updateOrderStatus = (orderId, status) => mutate(
    () => api(`/admin/orders/${orderId}/status`, token, { method: 'PATCH', body: JSON.stringify({ status }) }),
    status === 'cancelled' ? 'Заказ отменён, остатки возвращены' : status === 'completed' ? 'Заказ выполнен' : 'Заказ подтверждён',
  );

  const logout = () => {
    sessionStorage.removeItem('nova-admin-token');
    localStorage.removeItem('nova_admin_token');
    setToken(''); setAuthorized(false); setProducts([]); setCategories([]); setOrders([]); setError('');
  };

  if (!authorized) return <Login onLogin={load} busy={loading} error={error} />;

  return (
    <div className="admin-app" data-theme={theme}>
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">CONTROL PANEL</span>
          <h1>{settings.store_name || 'Управление магазином'}</h1>
        </div>
        <div className="admin-header-actions">
          {onGoToStore && (
            <button className="admin-icon" type="button" onClick={onGoToStore} aria-label="Вернуться в витрину магазина" title="Вернуться в магазин">
              <ShoppingBag size={20} />
            </button>
          )}
          <button className="admin-icon" type="button" onClick={toggleTheme} aria-label="Сменить тему">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <a className="admin-icon" href="./" aria-label="Открыть магазин"><ExternalLink size={20} /></a>
          <button className="admin-icon" type="button" onClick={logout} aria-label="Выйти"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-stats" aria-label="Сводка магазина">
          <article><Boxes size={20} /><span>Товаров<strong>{stats.products}</strong></span></article>
          <article><ClipboardList size={20} /><span>Новых заказов<strong>{stats.newOrders}</strong></span></article>
          <article><PackageOpen size={20} /><span>Остаток<strong>{stats.stock}</strong></span></article>
        </section>

        {error && <div className="admin-banner-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Закрыть ошибку"><X size={18} /></button></div>}

        <nav className="admin-tabs" aria-label="Разделы каталога">
          <button className={tab === 'products' ? 'active' : ''} type="button" onClick={() => setTab('products')}><Boxes size={18} />Товары</button>
          <button className={tab === 'categories' ? 'active' : ''} type="button" onClick={() => setTab('categories')}><FolderTree size={18} />Категории</button>
          <button className={tab === 'orders' ? 'active' : ''} type="button" onClick={() => setTab('orders')}><ClipboardList size={18} />Заказы{stats.newOrders > 0 && <i>{stats.newOrders}</i>}</button>
          <button className={tab === 'settings' ? 'active' : ''} type="button" onClick={() => setTab('settings')}><SlidersHorizontal size={18} />Настройки</button>
        </nav>

        <section className="admin-section-heading">
          <div>
            <span>{tab === 'products' ? 'Ассортимент' : tab === 'categories' ? 'Структура' : tab === 'orders' ? 'Продажи' : 'Кастомизация'}</span>
            <h2>{tab === 'products' ? 'Все товары' : tab === 'categories' ? 'Все категории' : tab === 'orders' ? 'Все заказы' : 'Настройки магазина'}</h2>
          </div>
          {['products', 'categories'].includes(tab) ? (
            <button className="admin-add" type="button" onClick={() => setEditor({ type: tab === 'products' ? 'product' : 'category', item: null })} disabled={tab === 'products' && !categories.length}>
              {tab === 'products' ? <PackagePlus size={19} /> : <FolderPlus size={19} />} Добавить
            </button>
          ) : (
            <button className="admin-add secondary" type="button" onClick={() => load()} disabled={loading}>
              <RefreshCw className={loading ? 'spin' : ''} size={19} /> Обновить
            </button>
          )}
        </section>

        {loading ? (
          <div className="admin-empty"><RefreshCw className="spin" size={28} /><h3>Загружаем каталог</h3></div>
        ) : tab === 'products' ? (
          <div className="admin-list">
            {products.length ? products.map((product) => (
              <article className="admin-product-row" key={product.id}>
                <div className={`admin-product-art tone-${product.tone}`}>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span>N</span>}</div>
                <div className="admin-row-copy">
                  <div className="admin-row-badges"><span>{product.categoryName}</span><i className={product.active ? 'active' : ''}>{product.active ? 'В каталоге' : 'Скрыт'}</i></div>
                  <h3>{product.name}</h3>
                  <p>{product.variants.length} вар. · {product.variants.reduce((sum, variant) => sum + variant.stock, 0)} шт.</p>
                  <strong>{new Intl.NumberFormat('ru-RU').format(product.price)} ₽</strong>
                </div>
                <div className="admin-row-actions">
                  <button className="admin-icon" type="button" onClick={() => setEditor({ type: 'product', item: product })} aria-label={`Редактировать ${product.name}`}><Pencil size={18} /></button>
                  <button className="admin-icon danger" type="button" onClick={() => window.confirm(`Удалить «${product.name}»?`) && mutate(() => api(`/admin/products/${product.id}`, token, { method: 'DELETE' }), 'Товар удалён')} aria-label={`Удалить ${product.name}`}><Trash2 size={18} /></button>
                </div>
              </article>
            )) : <div className="admin-empty"><PackageOpen size={30} /><h3>Товаров пока нет</h3><p>Добавьте первую карточку товара.</p></div>}
          </div>
        ) : tab === 'categories' ? (
          <div className="admin-list">
            {categories.length ? categories.map((category) => (
              <article className="admin-category-row" key={category.id}>
                <div className={`admin-category-dot tone-${category.tone}`} />
                <div className="admin-row-copy"><h3>{category.name}</h3><p>{category.productCount} товаров · {category.active ? 'показывается' : 'скрыта'}</p></div>
                <div className="admin-row-actions">
                  <button className="admin-icon" type="button" onClick={() => setEditor({ type: 'category', item: category })} aria-label={`Редактировать ${category.name}`}><Pencil size={18} /></button>
                  <button className="admin-icon danger" type="button" disabled={category.productCount > 0} onClick={() => window.confirm(`Удалить «${category.name}»?`) && mutate(() => api(`/admin/categories/${category.id}`, token, { method: 'DELETE' }), 'Категория удалена')} aria-label={`Удалить ${category.name}`}><Trash2 size={18} /></button>
                </div>
              </article>
            )) : <div className="admin-empty"><FolderTree size={30} /><h3>Категорий пока нет</h3><p>Сначала создайте категорию, затем добавляйте товары.</p></div>}
          </div>
        ) : tab === 'orders' ? (
          <div className="admin-list admin-orders-list">
            {orders.length ? orders.map((order) => (
              <button className="admin-order-row" type="button" key={order.id} onClick={() => setEditor({ type: 'order', item: order })}>
                <div className="admin-order-number"><ClipboardList size={19} /><strong>№{order.id}</strong></div>
                <div className="admin-row-copy">
                  <div className="admin-row-badges"><i className={`admin-order-status status-${order.status}`}>{orderLabels[order.status]}</i></div>
                  <h3>{order.customer.username ? `@${order.customer.username}` : order.customer.telegramUserId ? `Покупатель ${order.customer.telegramUserId}` : 'Гость'}</h3>
                  <p><Clock3 size={13} /> {formatDate(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} шт.</p>
                </div>
                <strong className="admin-order-total">{formatMoney(order.total)}</strong>
              </button>
            )) : <div className="admin-empty"><ClipboardList size={30} /><h3>Заказов пока нет</h3><p>Новые заказы из миниаппа появятся здесь.</p></div>}
          </div>
        ) : (
          <SettingsView settings={settings} busy={busy} onSave={saveSettings} />
        )}
      </main>

      {editor?.type === 'category' && <CategoryForm initial={editor.item} busy={busy} onSave={saveCategory} onClose={() => setEditor(null)} />}
      {editor?.type === 'product' && <ProductForm initial={editor.item} categories={categories} busy={busy} onSave={saveProduct} onClose={() => setEditor(null)} />}
      {editor?.type === 'order' && <OrderSheet order={editor.item} busy={busy} onStatus={updateOrderStatus} onClose={() => setEditor(null)} />}
      <div className={`admin-toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite"><CheckCircle2 size={18} />{notice}</div>
    </div>
  );
}

