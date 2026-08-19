export const categories = [
  { id: 'demo', name: 'Тестовая категория', subtitle: '1 товар', tone: 'orange' },
];

export const products = [
  {
    id: 'nova-mango',
    category: 'demo',
    name: 'NOVA Mango',
    caption: 'Сочный манго',
    price: 700,
    tone: 'orange',
    stock: 5,
    variants: [
      { id: 'nova-mango-mango', name: 'Манго', stock: 5 },
      { id: 'nova-mango-apple', name: 'Яблоко', stock: 3 },
      { id: 'nova-mango-grape', name: 'Виноград', stock: 0 },
      { id: 'nova-mango-ice', name: 'Лёд', stock: 12 },
    ],
  },
];

export const formatPrice = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
