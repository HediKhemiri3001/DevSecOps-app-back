import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty } from 'class-validator';
import { CreateFaultyHistoryDto } from 'src/history/dto/create-faulty-history.dto';
import { CreateHistoryDto } from 'src/history/dto/create-history.dto';
import { CreateReturnHistoryDto } from 'src/history/dto/create-return-history.dto';
import { CreateTakeHistoryDto } from 'src/history/dto/create-take-history.dto';
import { CreateTakesHistoryDto } from 'src/history/dto/create-takes-history.dto';
import { HistoryService } from 'src/history/history.service';
import { Project } from 'src/project/entities/project.entity';
import { ProjectService } from 'src/project/project.service';
import { User } from 'src/users/entities/user.entity';
import { Like, Repository } from 'typeorm';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import {
  Equipment,
  EquipmentCalibrationEnum,
  EquipmentConformityEnum,
  EquipmentPropertyEnum,
  EquipmentStatusEnum,
} from './entities/equipment.entity';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private equipmentsRepository: Repository<Equipment>,
    private readonly projectService: ProjectService,
    private readonly historyService: HistoryService,
  ) {}
  async create(createEquipmentDto: CreateEquipmentDto) {
    var equipment = this.equipmentsRepository.create(createEquipmentDto);
    let count = (
      await this.equipmentsRepository.findAndCountBy({
        category: createEquipmentDto.category,
      })
    )[1];
    equipment.ref = `${createEquipmentDto.category}_M${count}`;
    return await this.equipmentsRepository.save(equipment);
  }

  async findAll() {
    return await this.equipmentsRepository
      .createQueryBuilder('equip')
      .leftJoinAndSelect('equip.manager', 'user')
      .leftJoinAndSelect('equip.project', 'project')
      .getMany();
  }

  async findOne(id: string) {
    return await this.equipmentsRepository.findOneBy({ id: id });
  }

  async update(id: string, updateEquipmentDto: UpdateEquipmentDto) {
    return await this.equipmentsRepository.update(id, updateEquipmentDto);
  }

  async remove(id: string) {
    return await this.equipmentsRepository.delete(id);
  }
  async filter(keyword: string) {
    return await this.equipmentsRepository.find({
      where: [
        { label: Like(`%${keyword}%`) },
        { description: Like(`%${keyword}%`) },
      ],
    });
  }

  async getEquipmentOfProject(project: Project) {
    return await this.equipmentsRepository.find({
      where: [{ project: project }],
    });
  }
  async declareEquipFaulty(createFault: CreateFaultyHistoryDto) {
    this.historyService.createFault(createFault);
    this.equipmentsRepository.update(createFault.equipment, {
      defaults: createFault.description,
      conformity: EquipmentConformityEnum.notcompliant,
    });
  }

  async affectEquipToProject(createTake: CreateTakeHistoryDto) {
    //Affect equipment to project, this is done by a manager.
    let equipment = await this.findOne(
      createTake.equipment as unknown as string,
    );
    if (equipment.project != null) {
      throw new BadRequestException('Ce matériel appartient déja à un projet.');
    } else {
      await this.historyService.createTake(createTake);
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('manager')
        .of(equipment)
        .set(createTake.user);
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('project')
        .of(equipment)
        .set(createTake.project);
      return await this.equipmentsRepository
        .createQueryBuilder()
        .update()
        .where('id = :id', { id: equipment.id })
        .set({
          availability: EquipmentStatusEnum.InUseToOthers,
        })
        .execute();
    }
  }
  async returnEquipFromProject(createReturn: CreateReturnHistoryDto) {
    //Returns equipment to global storage and out of project jurisdiction, this is done by manager.
    let project = await this.projectService.findOne(
      createReturn.project as unknown as string,
    );
    if (project.id != (createReturn.project as unknown as string)) {
      throw new BadRequestException(
        "Ce matériel n'appartient pas à ce projet!",
      );
    } else {
      await this.historyService.createReturn(createReturn);
      let equipment = await this.findOne(
        createReturn.equipment as unknown as string,
      );
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('project')
        .of(equipment)
        .set(null);
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('manager')
        .of(equipment)
        .set(null);
      return await this.equipmentsRepository
        .createQueryBuilder()
        .update()
        .set({
          availability: EquipmentStatusEnum.availableToAll,
        })
        .where('id = :id', { id: equipment.id })
        .execute();
    }
  }
  async affectEquipToUserProject(createTakeUser: CreateTakeHistoryDto) {
    let members = this.projectService.getMembers(
      createTakeUser.project as unknown as string,
    );
    console.log(createTakeUser.project)
    if ((await members).includes(createTakeUser.user)) {
      let equipment = await this.equipmentsRepository.findOneBy({
        id: createTakeUser.equipment as unknown as string,
      });
      await this.historyService.createTake(createTakeUser);
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('manager')
        .of(equipment)
        .set(createTakeUser.user);
      return this.equipmentsRepository
        .createQueryBuilder()
        .update()
        .set({ availability: EquipmentStatusEnum.InUseToProject })
        .where('id = :id', { id: equipment.id })
        .execute();
    } else
      throw new UnauthorizedException('You are not a member of this project.');
  }
  async removeEquipToUserProject(createReturnUser: CreateReturnHistoryDto) {
    let members = this.projectService.getMembers(
      createReturnUser.project as unknown as string,
    );
    let project = await this.projectService.findOne(
      createReturnUser.project as unknown as string,
    );
    if ((await members).includes(createReturnUser.user)) {
      let equipment = await this.equipmentsRepository.findOneBy({
        id: createReturnUser.equipment as unknown as string,
      });
      await this.historyService.createReturn(createReturnUser);
      await this.equipmentsRepository
        .createQueryBuilder()
        .relation('manager')
        .of(equipment)
        .set(project.manager);
      return await this.equipmentsRepository
        .createQueryBuilder()
        .update()
        .set({ availability: EquipmentStatusEnum.InUseToOthers })
        .where('id = :id', { id: equipment.id })
        .execute();
    } else
      throw new UnauthorizedException('You are not a member of this project.');
  }
  async getPropClient() {
    return await this.equipmentsRepository.find({
      where: { property: EquipmentPropertyEnum.client },
    });
  }
  async getByStatus(status: EquipmentStatusEnum) {
    return await this.equipmentsRepository.find({
      where: { availability: status },
    });
  }
  async getByProject(id: string) {
    return this.equipmentsRepository
      .createQueryBuilder('equip')
      .select()
      .where('equip.projectId=:id', { id: id })
      .leftJoinAndSelect('equip.manager', 'user')
      .getMany();
  }
  async getMeasurementsEquipement() {
    return await this.equipmentsRepository.find({
      where: [
        { calibration: EquipmentCalibrationEnum.ok },
        { calibration: EquipmentCalibrationEnum.nok },
      ],
    });
  }

  async getCategories() {
    return await this.equipmentsRepository
      .createQueryBuilder()
      .select('category')
      .distinct()
      .execute();
  }
}
