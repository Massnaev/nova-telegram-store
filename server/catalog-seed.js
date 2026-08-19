export const catalogSeed = {
  categories: [
    { id: 'demo', name: 'Тестовая категория', subtitle: 'Для проверки каталога', tone: 'orange', sortOrder: 10 },
  ],
  products: [
    {
      id: 'nova-mango', categoryId: 'demo', name: 'NOVA Mango', caption: 'Демонстрационный товар',
      description: 'Насыщенный вкус, аккуратный баланс и проверенное качество NOVA.',
      price: 700, tone: 'orange', sortOrder: 10,
      variants: [
        { id: 'nova-mango-mango', slug: 'mango', name: 'Манго', stock: 5 },
        { id: 'nova-mango-apple', slug: 'apple', name: 'Яблоко', stock: 3 },
        { id: 'nova-mango-grape', slug: 'grape', name: 'Виноград', stock: 0 },
        { id: 'nova-mango-ice', slug: 'ice', name: 'Лёд', stock: 12 },
      ],
    },
  ],
};
