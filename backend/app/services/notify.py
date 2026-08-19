"""Bildirishnoma yuborish.

Kimga ketishi va matni — adminkadagi `notify_templates` dan olinadi
(hodisa + ixtiyoriy bosqich bo'yicha). Shablon topilmasa — DEFAULT_TEXTS
dagi zaxira matn ishlatiladi, shunda sozlanmagan hodisa ham yo'qolib qolmaydi.
"""

from sqlalchemy import distinct, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import now_utc
from app.models import (
    Notification,
    NotifyEvent,
    NotifyTemplate,
    Order,
    OrderStageHistory,
    Recipient,
    Role,
    User,
    user_stages,
)
from app.realtime.hub import hub
from app.services import telegram
from app.services.settings_store import get_setting

# Shablon yo'q bo'lsa ishlatiladigan zaxira matnlar: event -> (title_ru, title_uz, body_ru, body_uz)
DEFAULT_TEXTS: dict[str, tuple[str, str, str, str]] = {
    NotifyEvent.ORDER_CREATED: (
        "Новый проект {order_number}", "Yangi proyekt {order_number}",
        "{actor} создал проект «{order_title}»", "{actor} «{order_title}» proyektini yaratdi",
    ),
    NotifyEvent.ORDER_STAGE_CHANGED: (
        "{order_number}: этап {stage}", "{order_number}: {stage} bosqichi",
        "{actor} перевёл «{order_title}» с этапа {stage_prev} на {stage}",
        "{actor} «{order_title}» ni {stage_prev} dan {stage} ga o'tkazdi",
    ),
    NotifyEvent.ORDER_ASSIGNED: (
        "Вам назначен проект {order_number}", "Sizga {order_number} proyekti biriktirildi",
        "{actor} назначил вас ответственным на этапе {stage} — «{order_title}»",
        "{actor} sizni {stage} bosqichida mas'ul qildi — «{order_title}»",
    ),
    NotifyEvent.ORDER_CLAIMED: (
        "{order_number} взят в работу", "{order_number} ishga olindi",
        "{actor} взял «{order_title}» на этапе {stage}",
        "{actor} «{order_title}» ni {stage} bosqichida o'ziga oldi",
    ),
    NotifyEvent.ORDER_UNASSIGNED: (
        "{order_number}: снят исполнитель", "{order_number}: mas'ul olib tashlandi",
        "{actor} снял ответственного на этапе {stage} — «{order_title}»",
        "{actor} {stage} bosqichida mas'ulni olib tashladi — «{order_title}»",
    ),
    NotifyEvent.ORDER_RENAMED: (
        "{order_number} изменён", "{order_number} o'zgardi",
        "{actor} изменил данные проекта «{order_title}»",
        "{actor} «{order_title}» ma'lumotlarini o'zgartirdi",
    ),
    NotifyEvent.ORDER_SUCCESS: (
        "{order_number} — успех", "{order_number} — muvaffaqiyat",
        "Проект «{order_title}» завершён успешно", "«{order_title}» muvaffaqiyatli yakunlandi",
    ),
    NotifyEvent.ORDER_FAIL: (
        "{order_number} — провал", "{order_number} — muvaffaqiyatsiz",
        "Проект «{order_title}» закрыт как провал", "«{order_title}» muvaffaqiyatsiz yopildi",
    ),
    NotifyEvent.ORDER_OVERDUE: (
        "{order_number} просрочен", "{order_number} kechikdi",
        "Дедлайн этапа {stage} истёк — «{order_title}»",
        "{stage} bosqichining dedlayni o'tdi — «{order_title}»",
    ),
    NotifyEvent.ORDER_DEADLINE_OVERDUE: (
        "{order_number}: общий дедлайн истёк", "{order_number}: umumiy dedlayn o'tdi",
        "Проект «{order_title}» не завершён к дедлайну ({deadline}), этап: {stage}",
        "«{order_title}» proyekti dedlaynga ({deadline}) qadar yakunlanmadi, bosqich: {stage}",
    ),
    NotifyEvent.ORDER_FILE: (
        "{order_number}: новый файл", "{order_number}: yangi fayl",
        "{actor} загрузил файл в проект «{order_title}»",
        "{actor} «{order_title}» proyektiga fayl yukladi",
    ),
    NotifyEvent.ORDER_PAUSED: (
        "{order_number}: приостановлен", "{order_number}: to'xtatildi",
        "{actor} поставил «{order_title}» на паузу на этапе {stage}. Причина: {reason}",
        "{actor} «{order_title}» ni {stage} bosqichida pauza qildi. Sababi: {reason}",
    ),
    NotifyEvent.ORDER_RESUMED: (
        "{order_number}: возобновлён", "{order_number}: davom ettirildi",
        "{actor} снял с паузы «{order_title}» на этапе {stage}",
        "{actor} «{order_title}» ni {stage} bosqichida pauzadan chiqardi",
    ),
    NotifyEvent.ORDER_MOVED_BACK: (
        "{order_number}: возврат на этап {stage}", "{order_number}: {stage} bosqichiga qaytarildi",
        "{actor} вернул «{order_title}» с этапа {stage_prev} на этап {stage} — ваша работа на этом этапе может потребовать проверки",
        "{actor} «{order_title}» ni {stage_prev} dan {stage} bosqichiga qaytardi — bu bosqichdagi ishingiz qayta tekshirilishi mumkin",
    ),
    NotifyEvent.CHAT_MESSAGE: (
        "Сообщение от {actor}", "{actor} dan xabar",
        "{message}", "{message}",
    ),
}

DEFAULT_RECIPIENTS: dict[str, list[str]] = {
    NotifyEvent.ORDER_CREATED: [Recipient.RESPONSIBLE, "role:hr"],
    NotifyEvent.ORDER_STAGE_CHANGED: [Recipient.RESPONSIBLE, Recipient.STAGE_USERS],
    NotifyEvent.ORDER_ASSIGNED: [Recipient.RESPONSIBLE],
    NotifyEvent.ORDER_CLAIMED: [Recipient.PREV_RESPONSIBLE, "role:hr"],
    NotifyEvent.ORDER_UNASSIGNED: [Recipient.STAGE_USERS],
    NotifyEvent.ORDER_RENAMED: [Recipient.RESPONSIBLE],
    NotifyEvent.ORDER_SUCCESS: [Recipient.ORDER_PARTICIPANTS, Recipient.CREATED_BY, "role:hr"],
    NotifyEvent.ORDER_FAIL: [Recipient.ORDER_PARTICIPANTS, Recipient.CREATED_BY, "role:hr"],
    NotifyEvent.ORDER_OVERDUE: [Recipient.RESPONSIBLE, "role:hr"],
    NotifyEvent.ORDER_DEADLINE_OVERDUE: ["role:admin", "role:super_admin"],
    NotifyEvent.ORDER_FILE: [Recipient.RESPONSIBLE],
    NotifyEvent.ORDER_PAUSED: ["role:admin", "role:super_admin"],
    NotifyEvent.ORDER_RESUMED: ["role:admin", "role:super_admin"],
    NotifyEvent.ORDER_MOVED_BACK: [Recipient.SKIPPED_STAGE_WORKERS],
    NotifyEvent.CHAT_MESSAGE: [],  # chat a'zolari alohida hisoblanadi
}


def render(template: str, ctx: dict) -> str:
    """{placeholder} larni almashtiradi; noma'lum kalit xatoga olib kelmaydi."""

    class _Safe(dict):
        def __missing__(self, key):  # noqa: ANN001
            return "—"

    try:
        return template.format_map(_Safe(ctx))
    except Exception:
        return template


async def _template_for(
    db: AsyncSession, event: str, stage_id: int | None
) -> NotifyTemplate | None:
    """Avval bosqichga xos shablon, bo'lmasa umumiy (stage_id IS NULL)."""
    res = await db.execute(
        select(NotifyTemplate)
        .where(
            NotifyTemplate.event == event,
            NotifyTemplate.is_active.is_(True),
            or_(NotifyTemplate.stage_id == stage_id, NotifyTemplate.stage_id.is_(None)),
        )
        .order_by(NotifyTemplate.stage_id.is_(None).asc())  # aniqrog'i birinchi
    )
    return res.scalars().first()


async def resolve_recipients(
    db: AsyncSession,
    tokens: list[str],
    *,
    order: Order | None = None,
    actor: User | None = None,
    stage_id: int | None = None,
    prev_responsible_id: int | None = None,
    extra_user_ids: list[int] | None = None,
    skipped_responsible_ids: list[int] | None = None,
) -> set[int]:
    ids: set[int] = set(extra_user_ids or [])

    for token in tokens or []:
        if token == Recipient.RESPONSIBLE and order and order.responsible_id:
            ids.add(order.responsible_id)

        elif token == Recipient.PREV_RESPONSIBLE and prev_responsible_id:
            ids.add(prev_responsible_id)

        elif token == Recipient.CREATED_BY and order and order.created_by_id:
            ids.add(order.created_by_id)

        elif token == Recipient.ACTOR and actor:
            ids.add(actor.id)

        elif token == Recipient.STAGE_USERS and stage_id:
            res = await db.execute(
                select(user_stages.c.user_id).where(user_stages.c.stage_id == stage_id)
            )
            ids.update(res.scalars().all())

        elif token == Recipient.ORDER_PARTICIPANTS and order:
            res = await db.execute(
                select(distinct(OrderStageHistory.responsible_id)).where(
                    OrderStageHistory.order_id == order.id,
                    OrderStageHistory.responsible_id.is_not(None),
                )
            )
            ids.update(res.scalars().all())

        elif token == Recipient.SKIPPED_STAGE_WORKERS and skipped_responsible_ids:
            ids.update(skipped_responsible_ids)

        elif token.startswith("role:"):
            code = token.split(":", 1)[1]
            res = await db.execute(
                select(User.id)
                .join(Role, Role.id == User.role_id)
                .where(Role.code == code, User.is_active.is_(True))
            )
            ids.update(res.scalars().all())

        elif token.startswith("user:"):
            try:
                ids.add(int(token.split(":", 1)[1]))
            except ValueError:
                pass

    ids.discard(None)  # type: ignore[arg-type]
    return ids


async def notify(
    db: AsyncSession,
    event: str,
    *,
    order: Order | None = None,
    actor: User | None = None,
    stage_id: int | None = None,
    prev_responsible_id: int | None = None,
    extra_user_ids: list[int] | None = None,
    skipped_responsible_ids: list[int] | None = None,
    ctx: dict | None = None,
    link: dict | None = None,
) -> list[Notification]:
    """Hodisa bo'yicha bildirishnoma yaratadi va real-time yuboradi."""
    tpl = await _template_for(db, event, stage_id or (order.stage_id if order else None))

    if tpl is not None:
        tokens = list(tpl.recipients or [])
        notify_actor = tpl.notify_actor
        send_telegram = tpl.send_telegram
        texts = (tpl.title_ru, tpl.title_uz, tpl.body_ru, tpl.body_uz)
        if not any(texts):
            texts = DEFAULT_TEXTS.get(event, ("{order_number}", "{order_number}", "", ""))
    else:
        tokens = DEFAULT_RECIPIENTS.get(event, [])
        notify_actor = False
        send_telegram = False
        texts = DEFAULT_TEXTS.get(event, ("{order_number}", "{order_number}", "", ""))

    title_ru, title_uz, body_ru, body_uz = texts

    user_ids = await resolve_recipients(
        db, tokens,
        order=order, actor=actor, stage_id=stage_id,
        prev_responsible_id=prev_responsible_id, extra_user_ids=extra_user_ids,
        skipped_responsible_ids=skipped_responsible_ids,
    )
    if actor and not notify_actor:
        user_ids.discard(actor.id)
    if not user_ids:
        return []

    context = build_context(order, actor, ctx)
    if order is not None:
        base_url = (await get_setting(db, "frontend_url", "")).rstrip("/")
        context.setdefault("order_link", f"{base_url}/orders/{order.id}" if base_url else "—")
    if link is None and order is not None:
        link = {"type": "order", "id": order.id}

    res = await db.execute(select(User).where(User.id.in_(user_ids), User.is_active.is_(True)))
    recipients = list(res.scalars().all())

    created: list[Notification] = []
    for u in recipients:
        ru = u.lang != "uz"
        n = Notification(
            user_id=u.id,
            event=event,
            title=render(title_ru if ru else title_uz, context)[:255],
            body=render(body_ru if ru else body_uz, context),
            link=link,
            order_id=order.id if order else None,
            actor_id=actor.id if actor else None,
            created_at=now_utc(),
        )
        db.add(n)
        created.append(n)

    await db.flush()

    for n in created:
        await hub.publish(
            f"user:{n.user_id}",
            "notification.new",
            {
                "id": n.id,
                "event": n.event,
                "title": n.title,
                "body": n.body,
                "link": n.link,
                "created_at": n.created_at.isoformat(),
            },
        )
        if send_telegram:
            tg_text = n.title if not n.body else f"{n.title}\n\n{n.body}"
            await telegram.notify_user_telegram(db, n.user_id, tg_text)

    return created


def build_context(order: Order | None, actor: User | None, extra: dict | None) -> dict:
    ctx: dict = {
        "actor": actor.full_name if actor else "—",
        "company": "OMEGA DENTAL LAB",
    }
    if order is not None:
        ctx.update(
            {
                "id": order.id,
                "order_number": order.number,
                "order_title": order.title,
                "stage": order.stage.name_ru if order.stage else "—",
                "responsible": order.responsible.full_name if order.responsible else "—",
                "patient": order.patient.full_name if order.patient else "—",
                "doctor": order.doctor.full_name if order.doctor else "—",
                "deadline": order.deadline.strftime("%d.%m.%Y %H:%M") if order.deadline else "—",
            }
        )
    if extra:
        ctx.update(extra)
    return ctx
