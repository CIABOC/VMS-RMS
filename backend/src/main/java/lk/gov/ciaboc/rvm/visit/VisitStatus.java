package lk.gov.ciaboc.rvm.visit;

import java.util.EnumSet;
import java.util.Set;

/**
 * Visit lifecycle.
 * <pre>
 * PENDING_VERIFICATION -> PENDING_SIGNATURE -> WAITING -> ACCEPTED -> IN_PREMISES -> COMPLETED
 *                                                 |  ^        (host)
 *                                         DELAYED-+  +- REDIRECTED (new host, back to WAITING)
 *                                                 +-> DECLINED -> COMPLETED
 * Any state before IN_PREMISES can become CANCELLED.
 * </pre>
 */
public enum VisitStatus {
    PENDING_VERIFICATION,
    PENDING_SIGNATURE,
    WAITING,
    DELAYED,
    ACCEPTED,
    DECLINED,
    IN_PREMISES,
    COMPLETED,
    CANCELLED;

    /** Visits currently on the public queue display (token numbers only). */
    public static final Set<VisitStatus> ON_QUEUE = EnumSet.of(WAITING, DELAYED, ACCEPTED);

    /** Visits a host still needs to act on or is hosting. */
    public static final Set<VisitStatus> HOST_ACTIVE = EnumSet.of(WAITING, DELAYED, ACCEPTED, IN_PREMISES);

    public static final Set<VisitStatus> CANCELLABLE =
            EnumSet.of(PENDING_VERIFICATION, PENDING_SIGNATURE, WAITING, DELAYED, ACCEPTED);

    public static final Set<VisitStatus> CLOSED = EnumSet.of(COMPLETED, CANCELLED);
}
