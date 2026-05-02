import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const en = {
  translation: {
    nav: { home: "Home", search: "Search", add: "Add", analytics: "Analytics", profile: "Profile" },
    auth: { login: "Sign In", register: "Register", logout: "Sign Out", email: "Email", password: "Password" },
    price: { add: "Add Price", publish: "Publish", pending: "Pending", approved: "Approved", rejected: "Rejected" },
    product: { search: "Search products...", notFound: "No products found" },
    common: { loading: "Loading...", error: "Error", save: "Save", cancel: "Cancel" },
  },
};

const ru = {
  translation: {
    nav: { home: "Главная", search: "Поиск", add: "Добавить", analytics: "Аналитика", profile: "Профиль" },
    auth: { login: "Войти", register: "Регистрация", logout: "Выйти", email: "Email", password: "Пароль" },
    price: { add: "Добавить цену", publish: "Опубликовать", pending: "На проверке", approved: "Одобрено", rejected: "Отклонено" },
    product: { search: "Поиск товаров...", notFound: "Товары не найдены" },
    common: { loading: "Загрузка...", error: "Ошибка", save: "Сохранить", cancel: "Отмена" },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en, ru },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
