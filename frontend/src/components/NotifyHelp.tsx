import { useLang } from '@/i18n'
import { Modal } from '@/components/ui'

type EventDoc = { code: string; title_ru: string; title_uz: string; body_ru: string; body_uz: string }

const EVENTS: EventDoc[] = [
  {
    code: 'order.created',
    title_ru: 'Проект создан',
    title_uz: 'Proyekt yaratildi',
    body_ru: 'Срабатывает сразу при создании нового проекта.',
    body_uz: 'Yangi proyekt yaratilgan zahoti ishga tushadi.',
  },
  {
    code: 'order.stage_changed',
    title_ru: 'Смена этапа',
    title_uz: 'Bosqich o‘zgardi',
    body_ru: 'Срабатывает при переводе проекта на другой этап (кроме перевода в «Успех» или «Провал» — для них отдельные события ниже).',
    body_uz: 'Proyekt boshqa bosqichga o‘tkazilganda ishga tushadi («Успех» yoki «Провал»ga o‘tkazishdan tashqari — ular uchun pastda alohida hodisalar bor).',
  },
  {
    code: 'order.assigned',
    title_ru: 'Назначен ответственный',
    title_uz: 'Mas’ul biriktirildi',
    body_ru: 'Срабатывает, когда у проекта появляется ответственный — через кнопку «Назначить» (HR/админ), а также если ответственного указали прямо при переводе на этап (например, когда поле «Ответственный» настроено как обязательное при выходе с этапа).',
    body_uz: 'Proyektga mas’ul biriktirilganda ishga tushadi — «Tayinlash» tugmasi orqali (HR/admin), shuningdek bosqichga o‘tkazishda mas’ul to‘g‘ridan-to‘g‘ri ko‘rsatilsa ham (masalan, «Ответственный» maydoni bosqichdan chiqishda majburiy qilib qo‘yilgan bo‘lsa).',
  },
  {
    code: 'order.claimed',
    title_ru: 'Проект взят в работу',
    title_uz: 'Proyekt ishga olindi',
    body_ru: 'Срабатывает, когда сотрудник сам берёт свободный проект кнопкой «Взять» (Claim) на этапе, где это разрешено.',
    body_uz: 'Xodim ruxsat berilgan bosqichda bo‘sh proyektni «Olaman» (Claim) tugmasi bilan o‘ziga olganda ishga tushadi.',
  },
  {
    code: 'order.unassigned',
    title_ru: 'Снят ответственный',
    title_uz: 'Mas’ul olib tashlandi',
    body_ru: 'Срабатывает, когда HR/админ явно снимает ответственного (делает проект свободным) кнопкой «Назначить» → «—».',
    body_uz: 'HR/admin «Tayinlash» → «—» orqali mas’ulni ochiqdan-ochiq olib tashlaganda (proyektni bo‘sh qilganda) ishga tushadi.',
  },
  {
    code: 'order.renamed',
    title_ru: 'Изменены данные проекта',
    title_uz: 'Proyekt ma’lumoti o‘zgardi',
    body_ru: 'Срабатывает при изменении названия, врача или пациента проекта (карточка проекта → «Изменить»).',
    body_uz: 'Proyektning nomi, vrachi yoki patsenti o‘zgartirilganda ishga tushadi (proyekt kartochkasi → «O‘zgartirish»).',
  },
  {
    code: 'order.success',
    title_ru: 'Проект — успех',
    title_uz: 'Proyekt — muvaffaqiyat',
    body_ru: 'Срабатывает при переводе проекта на этап типа «Успех».',
    body_uz: 'Proyekt «Muvaffaqiyat» turidagi bosqichga o‘tkazilganda ishga tushadi.',
  },
  {
    code: 'order.fail',
    title_ru: 'Проект — провал',
    title_uz: 'Proyekt — muvaffaqiyatsiz',
    body_ru: 'Срабатывает при переводе проекта на этап типа «Провал».',
    body_uz: 'Proyekt «Muvaffaqiyatsiz» turidagi bosqichga o‘tkazilganda ishga tushadi.',
  },
  {
    code: 'order.overdue',
    title_ru: 'Просрочен дедлайн этапа',
    title_uz: 'Bosqich dedlayni o‘tdi',
    body_ru: 'Фоновая проверка (каждые 5 минут): если срок текущего этапа истёк. Повторяется не чаще, чем раз в N часов — интервал задаётся в «Общие настройки» → «Напоминание о просрочке этапа».',
    body_uz: 'Fon tekshiruvi (har 5 daqiqada): joriy bosqich muddati o‘tgan bo‘lsa. Har N soatda bir martadan ko‘p emas takrorlanadi — interval «Umumiy sozlamalar» → «Bosqich kechikishi eslatmasi»da beriladi.',
  },
  {
    code: 'order.deadline_overdue',
    title_ru: 'Просрочен общий дедлайн проекта',
    title_uz: 'Proyektning umumiy dedlayni o‘tdi',
    body_ru: 'Фоновая проверка (каждые 5 минут): если общий дедлайн проекта истёк (не путать с дедлайном этапа). Интервал повтора — «Общие настройки» → «Напоминание об общем дедлайне».',
    body_uz: 'Fon tekshiruvi (har 5 daqiqada): proyektning umumiy dedlayni o‘tgan bo‘lsa (bosqich dedlayni bilan aralashtirmang). Takrorlanish intervali — «Umumiy sozlamalar» → «Umumiy dedlayn eslatmasi».',
  },
  {
    code: 'order.file',
    title_ru: 'Загружен файл',
    title_uz: 'Fayl yuklandi',
    body_ru: 'Срабатывает при загрузке нового файла в проект.',
    body_uz: 'Proyektga yangi fayl yuklanganda ishga tushadi.',
  },
  {
    code: 'order.paused',
    title_ru: 'Проект поставлен на паузу',
    title_uz: 'Proyekt pauza qilindi',
    body_ru: 'Срабатывает, когда проект ставят на паузу (с указанием причины).',
    body_uz: 'Proyekt pauza qilinganda (sababi ko‘rsatilib) ishga tushadi.',
  },
  {
    code: 'order.resumed',
    title_ru: 'Проект возобновлён',
    title_uz: 'Proyekt davom ettirildi',
    body_ru: 'Срабатывает при снятии проекта с паузы.',
    body_uz: 'Proyekt pauzadan chiqarilganda ishga tushadi.',
  },
  {
    code: 'order.moved_back',
    title_ru: 'Проект возвращён на предыдущий этап',
    title_uz: 'Proyekt oldingi bosqichga qaytarildi',
    body_ru: 'Срабатывает при возврате проекта назад. Уходит тем, кто работал на пропущенных при этом этапах (токен получателя «Исполнители пропущенных этапов»).',
    body_uz: 'Proyekt orqaga qaytarilganda ishga tushadi. Shu vaqtda o‘tkazib yuborilgan bosqichlarda ishlaganlarga boradi («O‘tkazib yuborilgan bosqichlar bajaruvchilari» oluvchi tokeni).',
  },
  {
    code: 'chat.message',
    title_ru: 'Новое сообщение в чате',
    title_uz: 'Chatda yangi xabar',
    body_ru: 'Срабатывает при новом сообщении в чате проекта — уходит всем участникам чата, кроме автора сообщения и тех, кто отключил уведомления чата (Mute).',
    body_uz: 'Proyekt chatida yangi xabar yozilganda ishga tushadi — xabar muallifidan va chat bildirishnomasini o‘chirganlardan (Mute) tashqari barcha chat a’zolariga boradi.',
  },
]

const RECIPIENTS: { label_ru: string; label_uz: string; hint_ru: string; hint_uz: string }[] = [
  {
    label_ru: 'Ответственный', label_uz: 'Mas’ul',
    hint_ru: 'Текущий ответственный по проекту на момент события.',
    hint_uz: 'Hodisa bo‘lgan paytdagi proyektning joriy mas’uli.',
  },
  {
    label_ru: 'Предыдущий исполнитель', label_uz: 'Oldingi bajaruvchi',
    hint_ru: 'Кто был ответственным до этого действия (например, до смены этапа).',
    hint_uz: 'Shu harakatdan oldin mas’ul bo‘lgan kishi (masalan, bosqich almashtirilishidan oldin).',
  },
  {
    label_ru: 'Создатель проекта', label_uz: 'Proyekt yaratuvchisi',
    hint_ru: 'Кто изначально создал этот проект.',
    hint_uz: 'Proyektni dastlab yaratgan kishi.',
  },
  {
    label_ru: 'Все техники этапа', label_uz: 'Bosqichning barcha texniklari',
    hint_ru: 'Все сотрудники, которым разрешён этот этап (доступ настраивается в «Этапы»).',
    hint_uz: 'Shu bosqichga ruxsati bor barcha xodimlar (ruxsat «Bosqichlar» bo‘limida sozlanadi).',
  },
  {
    label_ru: 'Все участники проекта', label_uz: 'Proyektning barcha ishtirokchilari',
    hint_ru: 'Все, кто хоть раз был ответственным на любом этапе этого проекта.',
    hint_uz: 'Shu proyektning istalgan bosqichida hech bo‘lmasa bir marta mas’ul bo‘lgan hammasi.',
  },
  {
    label_ru: 'Сам инициатор', label_uz: 'Harakat qilgan odam',
    hint_ru: 'Тот, кто совершил действие. Обычно исключается — см. чекбокс «Отправлять и тому, кто сделал действие».',
    hint_uz: 'Harakatni qilgan kishining o‘zi. Odatda chiqarib tashlanadi — «Harakatni qilgan odamga ham yuborilsin» katagiga qarang.',
  },
  {
    label_ru: 'Исполнители пропущенных этапов', label_uz: 'O‘tkazib yuborilgan bosqichlar bajaruvchilari',
    hint_ru: 'Актуально только для события «Возвращён на предыдущий этап».',
    hint_uz: 'Faqat «Oldingi bosqichga qaytarildi» hodisasi uchun ishlatiladi.',
  },
  {
    label_ru: 'Роль: …', label_uz: 'Rol: …',
    hint_ru: 'Всем активным сотрудникам с этой ролью (например, всем HR или всем админам), независимо от их отношения к проекту.',
    hint_uz: 'Shu rolga ega barcha faol xodimlarga (masalan, barcha HR yoki barcha adminlarga), ularning proyektga aloqasidan qat’i nazar.',
  },
]

export default function NotifyHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang((s) => s.lang)
  const ru = lang === 'ru'

  return (
    <Modal open={open} onClose={onClose} title={ru ? 'Как настроить уведомления' : 'Bildirishnomalarni qanday sozlash'} wide>
      <div className="space-y-5 text-sm leading-relaxed text-ink dark:text-[#e6e9ee]">
        <section>
          <p className="text-ink-soft dark:text-[#98a2b3]">
            {ru
              ? 'На этой странице настраивается, кому и с каким текстом уходит уведомление при каждом событии в проектах — смена этапа, назначение ответственного, просрочка и т.д. Уведомления приходят в колокольчик в шапке сайта, а при включённой опции — ещё и в Telegram.'
              : 'Bu sahifada proyektlardagi har bir hodisa (bosqich almashishi, mas’ul tayinlash, kechikish va h.k.) uchun bildirishnoma kimga va qanday matnda ketishi sozlanadi. Bildirishnomalar sayt yuqorisidagi qo‘ng‘iroqqa keladi, yoqilgan bo‘lsa — Telegramga ham.'}
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{ru ? 'Как это работает' : 'Bu qanday ishlaydi'}</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-ink-soft dark:text-[#98a2b3]">
            <li>
              {ru
                ? 'Слева выберите событие. Если для него нет сохранённого шаблона (метка «default») — используются встроенный текст и получатели по умолчанию, событие всё равно работает.'
                : 'Chapdan hodisani tanlang. Agar unga saqlangan shablon bo‘lmasa («default» belgisi) — ichki matn va standart oluvchilar ishlatiladi, hodisa baribir ishlaydi.'}
            </li>
            <li>
              {ru
                ? 'Вверху формы можно выбрать конкретный этап («Только этап: …») — тогда правило сработает только для событий на этом этапе. Правило «Для всех этапов» — общее, применяется, если для конкретного этапа отдельного правила нет.'
                : 'Forma tepasida aniq bosqichni tanlash mumkin («Faqat bosqich: …») — bu holda qoida faqat shu bosqichdagi hodisalar uchun ishlaydi. «Barcha bosqichlar uchun» qoidasi umumiy — aniq bosqich uchun alohida qoida bo‘lmasa, shu ishlatiladi.'}
            </li>
            <li>
              {ru
                ? 'Поле «Получатели» — кому конкретно придёт уведомление. Можно выбрать несколько. Если ничего не выбрано — берутся получатели по умолчанию для этого события.'
                : '«Oluvchilar» maydoni — bildirishnoma aniq kimlarga borishi. Bir nechtasini tanlash mumkin. Hech narsa tanlanmasa — shu hodisa uchun standart oluvchilar olinadi.'}
            </li>
            <li>
              {ru
                ? 'Заголовок и текст можно оставить пустыми — тогда возьмётся стандартный (встроенный) текст. Если хотя бы что-то введено — используется именно ваш текст.'
                : 'Sarlavha va matnni bo‘sh qoldirish mumkin — shunda standart (ichki) matn olinadi. Agar biror narsa kiritilgan bo‘lsa — aynan sizning matningiz ishlatiladi.'}
            </li>
            <li>
              {ru
                ? '«Сбросить к умолчанию» удаляет сохранённое правило целиком — событие вернётся к встроенному поведению.'
                : '«Default holatga qaytarish» saqlangan qoidani butunlay o‘chiradi — hodisa ichki xatti-harakatga qaytadi.'}
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{ru ? 'Два переключателя в форме' : 'Formadagi ikkita katakcha'}</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-ink-soft dark:text-[#98a2b3]">
            <li>
              <b>{ru ? 'Отправлять и тому, кто сделал действие' : 'Harakatni qilgan odamga ham yuborilsin'}</b>
              {' — '}
              {ru
                ? 'по умолчанию инициатор действия не получает уведомление о своём же действии; включите, если нужно иначе.'
                : 'odatda harakatni qilgan kishi o‘z harakati haqida bildirishnoma olmaydi; boshqacha kerak bo‘lsa yoqing.'}
            </li>
            <li>
              <b>{ru ? 'Отправлять также в Telegram' : 'Telegram orqali ham yuborilsin'}</b>
              {' — '}
              {ru
                ? 'работает только для получателей, у кого подключён Telegram-бот (см. «Общие настройки» → Telegram), и только если бот включён и токен указан.'
                : 'faqat Telegram-boti ulangan oluvchilar uchun ishlaydi («Umumiy sozlamalar» → Telegram), va faqat bot yoqilgan hamda token kiritilgan bo‘lsa.'}
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{ru ? 'Переменные для текста' : 'Matn uchun o‘zgaruvchilar'}</h3>
          <p className="mb-2 text-ink-soft dark:text-[#98a2b3]">
            {ru
              ? 'Кликните в поле заголовка или текста, затем нажмите на переменную — она вставится в это место. В самом тексте переменные пишутся в фигурных скобках, например: «Проект {order_number}: этап {stage}».'
              : 'Sarlavha yoki matn maydoniga bosing, so‘ng o‘zgaruvchini bosing — u shu joyga qo‘shiladi. Matnning o‘zida o‘zgaruvchilar jingalak qavsda yoziladi, masalan: «Proyekt {order_number}: {stage} bosqichi».'}
          </p>
          <p className="text-ink-soft dark:text-[#98a2b3]">
            {ru
              ? 'Совет: {id} — «голый» номер проекта в базе, удобен для собственной ссылки, например «https://ваш-домен/orders/{id}». Готовая ссылка уже есть в переменной {order_link} — она формируется автоматически из адреса, указанного в «Общие настройки» → «Адрес сайта».'
              : 'Maslahat: {id} — proyektning bazadagi «yalang‘och» raqami, o‘zingiz havola qurish uchun qulay, masalan «https://sizning-domen/orders/{id}». Tayyor havola {order_link} o‘zgaruvchisida bor — u «Umumiy sozlamalar» → «Sayt manzili»da ko‘rsatilgan manzildan avtomatik quriladi.'}
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{ru ? 'Получатели — что означает каждый' : 'Oluvchilar — har biri nimani anglatadi'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {RECIPIENTS.map((r) => (
                  <tr key={ru ? r.label_ru : r.label_uz} className="border-b border-surface-border last:border-0 dark:border-[#2a3140]">
                    <td className="w-48 py-2 pr-3 align-top font-medium">{ru ? r.label_ru : r.label_uz}</td>
                    <td className="py-2 text-ink-soft dark:text-[#98a2b3]">{ru ? r.hint_ru : r.hint_uz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{ru ? 'Все события — когда срабатывают' : 'Barcha hodisalar — qachon ishga tushadi'}</h3>
          <div className="space-y-3">
            {EVENTS.map((ev) => (
              <div key={ev.code} className="rounded-lg border border-surface-border p-2.5 dark:border-[#2a3140]">
                <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{ru ? ev.title_ru : ev.title_uz}</span>
                  <span className="font-mono text-[10px] text-ink-faint">{ev.code}</span>
                </div>
                <p className="text-ink-soft dark:text-[#98a2b3]">{ru ? ev.body_ru : ev.body_uz}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  )
}
