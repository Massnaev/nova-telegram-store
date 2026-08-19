import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Home,
  Minus,
  Moon,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { categories as fallbackCategories, formatPrice, products as fallbackProducts } from './data.js';

const telegram = () => {
  const webApp = window.Telegram?.WebApp;
  return webApp?.initData ? webApp : null;
};

function ProductArt({ tone = 'orange', compact = false, imageUrl = '', alt = '' }) {
  return (
    <div className={`product-art tone-${tone} ${compact ? 'compact' : ''}`} aria-hidden={imageUrl ? undefined : 'true'}>
      {imageUrl ? <img src={imageUrl} alt={alt} loading="lazy" /> : <>
        <span className="orb orb-one" />
        <span className="orb orb-two" />
        <span className="bottle">
          <span className="bottle-cap" />
          <span className="bottle-label">N</span>
        </span>
      </>}
    </div>
  );
}

function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} type="button" {...props}>
      {children}
    </button>
  );
}

function AppHeader({ title, subtitle, canGoBack, onBack, cartCount, onCart, theme, onToggleTheme, brandName }) {
  return (
    <header className="app-header">
      <div className="header-side">
        {canGoBack ? (
          <IconButton label="Назад" onClick={onBack}><ArrowLeft size={22} /></IconButton>
        ) : (
          <div className="brand-mark" aria-label={brandName || 'NOVA'}>
            {(brandName || 'N').trim().charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="header-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <div className="header-side header-side-right" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <IconButton label="Сменить тему" onClick={onToggleTheme} className="theme-toggle-btn">
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </IconButton>
        <IconButton label={`Корзина, товаров: ${cartCount}`} onClick={onCart} className="cart-button">
          <ShoppingBag size={21} />
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </IconButton>
      </div>
    </header>
  );
}

function HomeScreen({ categories, products, settings, onCategory, onSearch, onProduct }) {
  return (
    <main className="screen screen-home">
      <section className="hero-card">
        <div className="hero-kicker"><Sparkles size={15} /> {settings?.store_name || 'NOVA MARKET'}</div>
        <h1>{settings?.store_tagline || 'Большой выбор. Легко заказать.'}</h1>
        <p>{settings?.store_description || 'Выберите товар и отправьте заказ администратору прямо в Telegram.'}</p>
        <button className="hero-search" type="button" onClick={onSearch}>
          <Search size={20} />
          <span>Найти товар или вкус</span>
          <SlidersHorizontal size={18} />
        </button>
        <div className="hero-decoration" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><span>Каталог</span><h2>Категории</h2></div>
          <button className="text-button" type="button" onClick={() => onCategory(categories[0]?.id)}>Все <ChevronRight size={16} /></button>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <button className="category-card" key={category.id} type="button" onClick={() => onCategory(category.id)}>
              <ProductArt tone={category.tone} compact />
              <strong>{category.name}</strong>
              <span>{category.subtitle}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section-block popular-section">
        <div className="section-heading"><div><span>Популярное</span><h2>Часто выбирают</h2></div></div>
        <div className="horizontal-products">
          {products.slice(0, 3).map((product) => (
            <button className="mini-product" key={product.id} type="button" onClick={() => onProduct(product)}>
              <ProductArt tone={product.tone} compact imageUrl={product.imageUrl} alt={product.name} />
              <span className={product.stock ? 'stock in-stock' : 'stock out-stock'}>{product.stock ? 'В наличии' : 'Нет в наличии'}</span>
              <strong>{product.name}</strong>
              <b>{formatPrice(product.price)}</b>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function CatalogScreen({ categories, products, categoryId, onProduct }) {
  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const shown = products.filter((item) => item.category === category?.id);

  return (
    <main className="screen">
      <div className="catalog-intro">
        <span>Категория</span>
        <h1>{category?.name ?? 'Каталог'}</h1>
        <p>{shown.length} позиций · наличие обновляется автоматически</p>
      </div>
      {shown.length ? <div className="product-grid">{shown.map((product) => <ProductCard product={product} key={product.id} onClick={() => onProduct(product)} />)}</div> : <div className="empty-state compact-empty"><PackageCheck size={30} /><h2>Здесь пока пусто</h2><p>Товары появятся после заполнения категории.</p></div>}
    </main>
  );
}

function ProductCard({ product, onClick }) {
  return (
    <button className="product-card" type="button" onClick={onClick}>
      <ProductArt tone={product.tone} imageUrl={product.imageUrl} alt={product.name} />
      <div className="product-card-body">
        <span className={product.stock ? 'stock in-stock' : 'stock out-stock'}>{product.stock ? `${product.stock} шт.` : 'Нет в наличии'}</span>
        <strong>{product.name}</strong>
        <small>{product.caption}</small>
        <b>{formatPrice(product.price)}</b>
      </div>
    </button>
  );
}

function SearchScreen({ products, onProduct }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((item) => `${item.name} ${item.caption} ${item.variants.map((v) => v.name).join(' ')}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <main className="screen">
      <label className="search-field">
        <Search size={20} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Товар, вкус или категория" />
        {query && <IconButton label="Очистить поиск" onClick={() => setQuery('')}><X size={18} /></IconButton>}
      </label>
      <div className="results-caption">{query ? `Результаты: ${results.length}` : 'Популярные товары'}</div>
      {results.length ? (
        <div className="search-results">
          {results.map((product) => (
            <button className="search-result" type="button" key={product.id} onClick={() => onProduct(product)}>
              <ProductArt tone={product.tone} compact imageUrl={product.imageUrl} alt={product.name} />
              <span><strong>{product.name}</strong><small>{product.caption}</small><b>{formatPrice(product.price)}</b></span>
              <ChevronRight size={20} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty"><Search size={30} /><h2>Ничего не нашли</h2><p>Попробуйте написать только название вкуса — например, «манго».</p></div>
      )}
    </main>
  );
}

function ProductScreen({ product, onAdd }) {
  const firstAvailable = product.variants.find((variant) => variant.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable.id);
  const [quantity, setQuantity] = useState(1);
  const variant = product.variants.find((item) => item.id === variantId);
  const available = variant.stock > 0;

  useEffect(() => setQuantity(1), [variantId]);

  return (
    <main className="screen product-screen">
      <ProductArt tone={product.tone} imageUrl={product.imageUrl} alt={product.name} />
      <div className="product-detail-card">
        <div className="product-title-row">
          <div><span>{product.caption}</span><h1>{product.name}</h1></div>
          <strong>{formatPrice(product.price)}</strong>
        </div>
        <p>Насыщенный вкус, аккуратный баланс и проверенное качество NOVA.</p>
        <div className="field-label"><span>Выберите вкус</span><small>{variant.stock} шт. в наличии</small></div>
        <div className="variant-list" role="radiogroup" aria-label="Выберите вкус">
          {product.variants.map((item) => (
            <button
              className={`variant-chip ${item.id === variantId ? 'selected' : ''}`}
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === variantId}
              disabled={!item.stock}
              onClick={() => setVariantId(item.id)}
            >
              {item.name}{item.id === variantId && <Check size={15} />}
            </button>
          ))}
        </div>
        <div className="quantity-row">
          <div><span>Количество</span><small>{available ? `Можно добавить до ${variant.stock} шт.` : 'Вкус закончился'}</small></div>
          <div className="stepper">
            <IconButton label="Уменьшить количество" disabled={quantity <= 1} onClick={() => setQuantity((value) => value - 1)}><Minus size={18} /></IconButton>
            <strong>{quantity}</strong>
            <IconButton label="Увеличить количество" disabled={quantity >= variant.stock} onClick={() => setQuantity((value) => value + 1)}><Plus size={18} /></IconButton>
          </div>
        </div>
      </div>
      <div className="sticky-action">
        <button className="primary-button" type="button" disabled={!available} onClick={() => onAdd(product, variant, quantity)}>
          <ShoppingBag size={20} /> {available ? `Добавить · ${formatPrice(product.price * quantity)}` : 'Нет в наличии'}
        </button>
      </div>
    </main>
  );
}

function CartScreen({ items, onQuantity, onRemove, onCheckout, onHome }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!items.length) {
    return (
      <main className="screen empty-state">
        <div className="empty-icon"><ShoppingBag size={32} /></div>
        <h1>Корзина пока пуста</h1>
        <p>Добавьте товары из каталога — всё выбранное появится здесь.</p>
        <button className="primary-button" type="button" onClick={onHome}>Перейти в каталог</button>
      </main>
    );
  }

  return (
    <main className="screen cart-screen">
      <div className="cart-list">
        {items.map((item) => (
          <article className="cart-item" key={`${item.id}-${item.variant.id}`}>
            <ProductArt tone={item.tone} compact imageUrl={item.imageUrl} alt={item.name} />
            <div className="cart-item-copy"><strong>{item.name}</strong><span>{item.variant.name}</span><b>{formatPrice(item.price)}</b></div>
            <div className="cart-item-actions">
              <IconButton label={`Удалить ${item.name}`} className="remove-button" onClick={() => onRemove(item)}><X size={17} /></IconButton>
              <div className="stepper small-stepper">
                <IconButton label="Уменьшить" onClick={() => onQuantity(item, -1)}><Minus size={15} /></IconButton>
                <strong>{item.quantity}</strong>
                <IconButton label="Увеличить" disabled={item.quantity >= item.variant.stock} onClick={() => onQuantity(item, 1)}><Plus size={15} /></IconButton>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="order-total"><span>Итого</span><strong>{formatPrice(total)}</strong></div>
      <div className="availability-note"><PackageCheck size={21} /><span><strong>Наличие проверено</strong><small>Все позиции доступны для заказа</small></span></div>
      <div className="sticky-action"><button className="primary-button" type="button" onClick={onCheckout}>Оформить заказ <ChevronRight size={20} /></button></div>
    </main>
  );
}

function CheckoutScreen({ items, comment, setComment, onSubmit, busy, error }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return (
    <main className="screen checkout-screen">
      <div className="progress"><span className="done" /><span className="done" /><span /></div>
      <section className="summary-card">
        <div className="summary-title"><span>Проверьте заказ</span><b>{items.reduce((sum, item) => sum + item.quantity, 0)} товара</b></div>
        {items.map((item) => (
          <div className="summary-line" key={`${item.id}-${item.variant.id}`}>
            <span>{item.quantity}× {item.name} · {item.variant.name}</span><b>{formatPrice(item.price * item.quantity)}</b>
          </div>
        ))}
        <div className="summary-total"><span>Итого</span><strong>{formatPrice(total)}</strong></div>
      </section>
      <label className="comment-field">
        <span>Комментарий к заказу</span>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: напишите перед отправкой" maxLength={300} />
        <small>{comment.length}/300</small>
      </label>
      <div className="info-panel"><PackageCheck size={20} /><span><strong>Оплата и доставка</strong><small>Менеджер уточнит детали с вами в Telegram.</small></span></div>
      {error && <div className="checkout-error" role="alert">{error}</div>}
      <div className="sticky-action"><button className="primary-button" type="button" disabled={busy} onClick={onSubmit}>{busy ? 'Создаём заказ…' : 'Оформить заказ'} <Send size={19} /></button></div>
    </main>
  );
}

function HandoffScreen({ orderId, items, comment, adminUsername, onHome, onClose }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cleanAdmin = adminUsername ? adminUsername.replace(/^@/, '') : '';

  return (
    <main className="screen handoff-screen">
      <div className="success-mark"><Check size={38} /></div>
      <span className="success-kicker">Заказ оформлен</span>
      <h1>{orderId ? `Заказ №${orderId}` : 'Всё готово'}</h1>
      <p>Администратор уже получил ваш заказ и скоро свяжется с вами в Telegram.</p>
      <section className="handoff-card">
        <div><span>Позиций</span><strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
        <div><span>Сумма</span><strong>{formatPrice(total)}</strong></div>
        {comment && <small>Комментарий: {comment}</small>}
      </section>
      {cleanAdmin && (
        <a
          className="secondary-button"
          href={`https://t.me/${cleanAdmin}`}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: 'none', marginBottom: '8px' }}
        >
          <Send size={16} /> Написать менеджеру (@{cleanAdmin})
        </a>
      )}
      <button className="primary-button" type="button" onClick={onHome}>
        <ShoppingBag size={19} /> Вернуться в каталог
      </button>
      {onClose && (
        <button className="secondary-button" type="button" onClick={onClose} style={{ marginTop: '8px' }}>
          Закрыть магазин
        </button>
      )}
    </main>
  );
}

function BottomNav({ screen, cartCount, onHome, onCatalog, onCart }) {
  if (['product', 'checkout', 'handoff'].includes(screen)) return null;
  return (
    <nav className="bottom-nav" aria-label="Основная navigation">
      <button className={screen === 'home' ? 'active' : ''} type="button" onClick={onHome}><Home size={20} /><span>Главная</span></button>
      <button className={screen === 'category' ? 'active' : ''} type="button" onClick={onCatalog}><Sparkles size={20} /><span>Каталог</span></button>
      <button className={screen === 'cart' ? 'active' : ''} type="button" onClick={onCart}><span className="nav-icon"><ShoppingBag size={20} />{cartCount > 0 && <i>{cartCount}</i>}</span><span>Корзина</span></button>
    </nav>
  );
}

export default function App() {
  const [categories, setCategories] = useState(fallbackCategories);
  const [products, setProducts] = useState(fallbackProducts);
  const [settings, setSettings] = useState({
    store_name: 'NOVA Market',
    store_tagline: 'Большой выбор. Легко заказать.',
    store_description: 'Выберите товар и отправьте заказ администратору прямо в Telegram.',
    admin_username: '',
  });
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('nova-theme');
    if (saved) return saved;
    const tgScheme = window.Telegram?.WebApp?.colorScheme;
    if (tgScheme === 'dark' || tgScheme === 'light') return tgScheme;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  const [screen, setScreen] = useState('home');
  const [history, setHistory] = useState([]);
  const [categoryId, setCategoryId] = useState(fallbackCategories[0]?.id ?? '');
  const [selectedProduct, setSelectedProduct] = useState(fallbackProducts[0]);
  const [cart, setCart] = useState([]);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const titleMap = {
    home: settings.store_name || 'NOVA',
    category: 'Каталог',
    search: 'Поиск',
    product: 'Карточка товара',
    cart: 'Корзина',
    checkout: 'Проверка заказа',
    handoff: 'Заказ готов',
  };

  const go = (next) => {
    if (next === screen) return;
    setHistory((items) => [...items, screen]);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    const previous = history.at(-1) ?? 'home';
    setHistory((items) => items.slice(0, -1));
    setScreen(previous);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nova-theme', theme);
    const tg = telegram();
    tg?.ready();
    tg?.expand();
    const bg = theme === 'dark' ? '#0b0f19' : '#f6f9ff';
    tg?.setHeaderColor?.(bg);
    tg?.setBackgroundColor?.(bg);
  }, [theme]);

  const toggleTheme = () => setTheme((curr) => (curr === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/categories').then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch('/api/products').then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch('/api/settings').then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
    ]).then(([categoryResponse, productResponse, settingsResponse]) => {
      if (cancelled) return;
      if (settingsResponse?.data) setSettings(settingsResponse.data);
      const nextCategories = categoryResponse.data.map((category) => ({
        ...category,
        subtitle: `${category.productCount} ${category.productCount === 1 ? 'товар' : 'товаров'}`,
      }));
      const nextProducts = productResponse.data.map((product) => ({ ...product, category: product.categoryId }));
      setCategories(nextCategories);
      setProducts(nextProducts);
      if (nextCategories.length) setCategoryId((current) => nextCategories.some((item) => item.id === current) ? current : nextCategories[0].id);
      if (nextProducts.length) setSelectedProduct((current) => nextProducts.find((item) => item.id === current?.id) ?? nextProducts[0]);
      setCart((items) => items.filter((item) => nextProducts.some((product) => product.id === item.id)));
    }).catch(() => {
      if (!cancelled) setToast('API недоступен — показан тестовый каталог');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const tg = telegram();
    if (!tg?.BackButton) return undefined;
    if (screen === 'home') tg.BackButton.hide(); else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg.BackButton.offClick(back);
  }, [screen, history]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const openProduct = (product) => { setSelectedProduct(product); go('product'); };
  const openCategory = (id) => { setCategoryId(id); go('category'); };
  const addToCart = (product, variant, quantity) => {
    setCart((items) => {
      const key = `${product.id}-${variant.id}`;
      const current = items.find((item) => `${item.id}-${item.variant.id}` === key);
      if (current) return items.map((item) => `${item.id}-${item.variant.id}` === key ? { ...item, quantity: Math.min(item.quantity + quantity, variant.stock) } : item);
      return [...items, { ...product, variant, quantity }];
    });
    telegram()?.HapticFeedback?.notificationOccurred?.('success');
    setToast(`${product.name} добавлен в корзину`);
  };
  const changeQuantity = (target, delta) => setCart((items) => items.map((item) => item.id === target.id && item.variant.id === target.variant.id ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, item.variant.stock)) } : item));
  const removeItem = (target) => setCart((items) => items.filter((item) => !(item.id === target.id && item.variant.id === target.variant.id)));

  const submitOrder = async () => {
    setSubmitting(true);
    setOrderError('');
    try {
      const user = telegram()?.initDataUnsafe?.user;
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((item) => ({ productId: item.id, variantId: item.variant.id, quantity: item.quantity })),
          comment,
          customer: user ? { telegramUserId: String(user.id), username: user.username } : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось создать заказ');
      setCreatedOrderId(body.data.id);
      setLastOrder({ items: cart, comment });
      setCart([]);
      setToast(`Заказ №${body.data.id} создан`);
      go('handoff');
    } catch (error) {
      setOrderError(`${error.message}. Проверьте состав корзины и попробуйте ещё раз.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseApp = () => {
    const tg = telegram();
    if (tg?.close) {
      tg.close();
    } else {
      setHistory([]);
      setScreen('home');
    }
  };

  const renderScreen = () => {
    if (screen === 'home') return <HomeScreen categories={categories} products={products} settings={settings} onCategory={openCategory} onSearch={() => go('search')} onProduct={openProduct} />;
    if (screen === 'category') return <CatalogScreen categories={categories} products={products} categoryId={categoryId} onProduct={openProduct} />;
    if (screen === 'search') return <SearchScreen products={products} onProduct={openProduct} />;
    if (screen === 'product') return <ProductScreen product={selectedProduct} onAdd={addToCart} />;
    if (screen === 'cart') return <CartScreen items={cart} onQuantity={changeQuantity} onRemove={removeItem} onCheckout={() => go('checkout')} onHome={() => { setHistory([]); setScreen('home'); }} />;
    if (screen === 'checkout') return <CheckoutScreen items={cart} comment={comment} setComment={setComment} onSubmit={submitOrder} busy={submitting} error={orderError} />;
    
    const handoffItems = lastOrder ? lastOrder.items : cart;
    const handoffComment = lastOrder ? lastOrder.comment : comment;
    return (
      <HandoffScreen
        orderId={createdOrderId}
        items={handoffItems}
        comment={handoffComment}
        adminUsername={settings.admin_username}
        onHome={() => { setHistory([]); setScreen('home'); }}
        onClose={handleCloseApp}
      />
    );
  };

  return (
    <div className="app-shell">
      <div className="desktop-glow glow-one" aria-hidden="true" />
      <div className="desktop-glow glow-two" aria-hidden="true" />
      <div className="phone-frame">
        <AppHeader
          title={titleMap[screen]}
          subtitle={screen === 'home' ? (settings.store_tagline || 'Маркет в Telegram') : ''}
          canGoBack={!['home', 'category'].includes(screen)}
          onBack={back}
          cartCount={cartCount}
          onCart={() => go('cart')}
          theme={theme}
          onToggleTheme={toggleTheme}
          brandName={settings.store_name}
        />
        {renderScreen()}
        <BottomNav screen={screen} cartCount={cartCount} onHome={() => { setHistory([]); setScreen('home'); }} onCatalog={() => openCategory(categoryId)} onCart={() => go('cart')} />
        <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite"><Check size={17} />{toast}</div>
      </div>
    </div>
  );
}

