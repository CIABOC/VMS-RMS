package lk.gov.ciaboc.rvm.masterdata;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "visitor_category")
@Getter
@Setter
public class VisitorCategory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String code;
    private String name;
    private boolean requiresAppointment;
    private boolean requiresDeviceCustody;
    private boolean active = true;
}
