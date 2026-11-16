package lk.gov.ciaboc.rvm.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface AppointmentRepository extends JpaRepository<Appointment, Long> {

    @Query("""
            select a from Appointment a
            where a.startsAt < :to and a.endsAt > :from
            order by a.startsAt
            """)
    List<Appointment> findInRange(Instant from, Instant to);

    @Query("""
            select a from Appointment a
            where a.host.id = :hostId and a.startsAt < :to and a.endsAt > :from
            order by a.startsAt
            """)
    List<Appointment> findInRangeForHost(Long hostId, Instant from, Instant to);

    @Query("""
            select count(a) > 0 from Appointment a
            where a.host.id = :hostId and a.status = 'SCHEDULED'
              and a.startsAt < :endsAt and a.endsAt > :startsAt
            """)
    boolean overlaps(Long hostId, Instant startsAt, Instant endsAt);
}
